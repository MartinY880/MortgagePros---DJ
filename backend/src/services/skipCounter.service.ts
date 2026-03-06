import { PrismaClient } from '@prisma/client';

export interface SkipState {
  trackId: string | null;
  skipCount: number;
  threshold: number;
}

export interface SkipUpdateResult {
  state: SkipState;
  previousTrackId: string | null;
  alreadyVoted?: boolean;
  /** true when the vote was rejected because the threshold was already reached */
  thresholdAlreadyReached?: boolean;
  /** true when the vote was rejected because the track changed */
  trackMismatch?: boolean;
}

const prisma = new PrismaClient();
const SKIP_THRESHOLD = 5;

/* ──────────────────────────────────────────────────────────────────────
 *  In-memory skip gate
 *
 *  Prevents the Prisma timeout storm that happens when dozens of users
 *  hit the skip endpoint simultaneously.  The gate:
 *    1. Tracks the current trackId + vote count + voter set per session
 *    2. Rejects votes instantly (no DB hit) when:
 *       • the threshold is already met
 *       • the caller already voted
 *       • the trackId doesn't match the song being voted on
 *    3. Serialises DB writes through a per-session promise queue so only
 *       one Prisma transaction runs at a time per session.
 * ──────────────────────────────────────────────────────────────────── */
interface GateEntry {
  trackId: string | null;
  skipCount: number;
  voters: Set<string>;
  /** Promise chain that serialises DB writes for this session */
  queue: Promise<void>;
}

const gate = new Map<string, GateEntry>();

function getGate(sessionId: string): GateEntry {
  let entry = gate.get(sessionId);
  if (!entry) {
    entry = { trackId: null, skipCount: 0, voters: new Set(), queue: Promise.resolve() };
    gate.set(sessionId, entry);
  }
  return entry;
}

/** Enqueue work so only one Prisma transaction runs per session at a time */
function enqueue<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const entry = getGate(sessionId);
  const result = entry.queue.then(fn, fn);          // run even if previous rejects
  entry.queue = result.then(() => {}, () => {});     // swallow for chain
  return result;
}

class SkipCounterService {
  getThreshold() {
    return SKIP_THRESHOLD;
  }

  /** Expose the in-memory gate state (for fast reads in the controller) */
  getGateState(sessionId: string): { trackId: string | null; skipCount: number; voterCount: number } {
    const g = gate.get(sessionId);
    return {
      trackId: g?.trackId ?? null,
      skipCount: g?.skipCount ?? 0,
      voterCount: g?.voters.size ?? 0,
    };
  }

  /** Reset the in-memory gate for a session (call after a successful skip) */
  resetGate(sessionId: string) {
    const entry = gate.get(sessionId);
    if (entry) {
      entry.trackId = null;
      entry.skipCount = 0;
      entry.voters.clear();
    }
  }

  private formatState(record: { spotifyTrackId: string | null; skipCount: number }): SkipState {
    return {
      trackId: record.spotifyTrackId,
      skipCount: record.skipCount,
      threshold: SKIP_THRESHOLD,
    };
  }

  async getState(sessionId: string): Promise<SkipState> {
    const existing = await prisma.sessionSkipCounter.findUnique({ where: { sessionId } });

    if (!existing) {
      return {
        trackId: null,
        skipCount: 0,
        threshold: SKIP_THRESHOLD,
      };
    }

    return this.formatState(existing);
  }

  async syncCurrentTrack(sessionId: string, trackId: string | null): Promise<SkipState> {
    const g = getGate(sessionId);

    // Fast-path: gate already in sync — skip the DB entirely
    if (g.trackId === trackId && trackId !== null) {
      return { trackId: g.trackId, skipCount: g.skipCount, threshold: SKIP_THRESHOLD };
    }

    // Track changed — reset the gate immediately so incoming votes for the
    // old track are rejected in-memory before the DB transaction completes.
    if (g.trackId !== trackId) {
      g.trackId = trackId;
      g.skipCount = 0;
      g.voters.clear();
    }

    return enqueue(sessionId, () =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.sessionSkipCounter.findUnique({ where: { sessionId } });

        if (!existing) {
          const created = await tx.sessionSkipCounter.create({
            data: {
              sessionId,
              spotifyTrackId: trackId ?? null,
              skipCount: 0,
            },
          });

          if (trackId === null) {
            await tx.sessionSkipVote.deleteMany({ where: { sessionId } });
          }

          return this.formatState(created);
        }

        if (existing.spotifyTrackId === trackId) {
          if (trackId === null && existing.skipCount !== 0) {
            await tx.sessionSkipVote.deleteMany({ where: { sessionId } });
            const updated = await tx.sessionSkipCounter.update({
              where: { sessionId },
              data: { spotifyTrackId: null, skipCount: 0 },
            });
            return this.formatState(updated);
          }

          // Reconcile gate from DB in case process restarted
          g.skipCount = existing.skipCount;
          return this.formatState(existing);
        }

        await tx.sessionSkipVote.deleteMany({ where: { sessionId } });

        const updated = await tx.sessionSkipCounter.update({
          where: { sessionId },
          data: {
            spotifyTrackId: trackId ?? null,
            skipCount: 0,
          },
        });

        return this.formatState(updated);
      }),
    );
  }

  async hasGuestVoted(sessionId: string, trackId: string, guestId: string): Promise<boolean> {
    if (!trackId) {
      return false;
    }

    // Check in-memory first — avoids a DB read
    const g = gate.get(sessionId);
    if (g && g.trackId === trackId && g.voters.has(guestId)) {
      return true;
    }

    const vote = await prisma.sessionSkipVote.findUnique({
      where: {
        sessionId_spotifyTrackId_guestId: {
          sessionId,
          spotifyTrackId: trackId,
          guestId,
        },
      },
      select: { id: true },
    });

    return Boolean(vote);
  }

  /**
   * Register a skip vote.
   *
   * The in-memory gate does three fast checks **before** touching the DB:
   *   1. trackId must match what the gate thinks is current
   *   2. guest must not have voted already
   *   3. skip count must be below threshold
   *
   * If all pass, the actual DB write is serialised through a per-session
   * queue so only one Prisma transaction runs at a time — eliminating
   * SQLite lock contention.
   */
  async addVote(sessionId: string, trackId: string, guestId: string): Promise<SkipUpdateResult> {
    if (!trackId) {
      throw new Error('Cannot register skip vote without an active track');
    }

    const g = getGate(sessionId);

    // ── Fast in-memory rejections (zero DB cost) ──

    // Track has changed since the caller fetched playback state
    if (g.trackId !== null && g.trackId !== trackId) {
      return {
        state: { trackId: g.trackId, skipCount: g.skipCount, threshold: SKIP_THRESHOLD },
        previousTrackId: g.trackId,
        trackMismatch: true,
      };
    }

    // Already voted
    if (g.voters.has(guestId)) {
      return {
        state: { trackId: g.trackId, skipCount: g.skipCount, threshold: SKIP_THRESHOLD },
        previousTrackId: g.trackId,
        alreadyVoted: true,
      };
    }

    // Threshold already reached — don't pile more writes onto the DB
    if (g.skipCount >= SKIP_THRESHOLD) {
      return {
        state: { trackId: g.trackId, skipCount: g.skipCount, threshold: SKIP_THRESHOLD },
        previousTrackId: g.trackId,
        thresholdAlreadyReached: true,
      };
    }

    // ── Optimistically update the gate so the NEXT request is also fast ──
    g.voters.add(guestId);
    g.skipCount++;
    if (g.trackId === null) {
      g.trackId = trackId;
    }

    // ── Serialised DB write ──
    return enqueue(sessionId, async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          let counter = await tx.sessionSkipCounter.findUnique({ where: { sessionId } });

          if (!counter) {
            counter = await tx.sessionSkipCounter.create({
              data: {
                sessionId,
                spotifyTrackId: trackId,
                skipCount: 0,
              },
            });
          }

          if (counter.spotifyTrackId !== trackId) {
            await tx.sessionSkipVote.deleteMany({ where: { sessionId } });
            counter = await tx.sessionSkipCounter.update({
              where: { sessionId },
              data: {
                spotifyTrackId: trackId,
                skipCount: 0,
              },
            });
          }

          const existingVote = await tx.sessionSkipVote.findUnique({
            where: {
              sessionId_spotifyTrackId_guestId: {
                sessionId,
                spotifyTrackId: trackId,
                guestId,
              },
            },
            select: { id: true },
          });

          if (existingVote) {
            // DB says already voted — reconcile the gate
            return {
              state: this.formatState(counter),
              previousTrackId: counter.spotifyTrackId,
              alreadyVoted: true,
            };
          }

          await tx.sessionSkipVote.create({
            data: {
              sessionId,
              spotifyTrackId: trackId,
              guestId,
            },
          });

          const updatedCounter = await tx.sessionSkipCounter.update({
            where: { sessionId },
            data: {
              spotifyTrackId: trackId,
              skipCount: {
                increment: 1,
              },
            },
          });

          // Keep gate in sync with DB truth
          g.skipCount = updatedCounter.skipCount;

          return {
            state: this.formatState(updatedCounter),
            previousTrackId: counter.spotifyTrackId,
            alreadyVoted: false,
          };
        });
      } catch (err) {
        // Roll back the optimistic gate update so the voter can retry
        g.voters.delete(guestId);
        g.skipCount = Math.max(0, g.skipCount - 1);
        throw err;
      }
    });
  }

  async removeVote(sessionId: string, trackId: string, guestId: string): Promise<SkipState> {
    if (!trackId) {
      return this.syncCurrentTrack(sessionId, null);
    }

    // Update gate optimistically
    const g = getGate(sessionId);
    if (g.trackId === trackId) {
      g.voters.delete(guestId);
      g.skipCount = Math.max(0, g.skipCount - 1);
    }

    return enqueue(sessionId, () =>
      prisma.$transaction(async (tx) => {
        const counter = await tx.sessionSkipCounter.findUnique({ where: { sessionId } });

        if (!counter || counter.spotifyTrackId !== trackId) {
          return counter ? this.formatState(counter) : {
            trackId: null,
            skipCount: 0,
            threshold: SKIP_THRESHOLD,
          };
        }

        const deleted = await tx.sessionSkipVote.deleteMany({
          where: {
            sessionId,
            spotifyTrackId: trackId,
            guestId,
          },
        });

        if (deleted.count === 0) {
          return this.formatState(counter);
        }

        const nextCount = Math.max(0, counter.skipCount - deleted.count);

        const updated = await tx.sessionSkipCounter.update({
          where: { sessionId },
          data: { skipCount: nextCount },
        });

        return this.formatState(updated);
      }),
    );
  }

  async reset(sessionId: string): Promise<SkipUpdateResult> {
    return enqueue(sessionId, () =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.sessionSkipCounter.findUnique({ where: { sessionId } });

        if (!existing) {
          const created = await tx.sessionSkipCounter.create({
            data: {
              sessionId,
              spotifyTrackId: null,
              skipCount: 0,
            },
          });

          return {
            state: this.formatState(created),
            previousTrackId: null,
          };
        }

        await tx.sessionSkipVote.deleteMany({ where: { sessionId } });

        const updated = await tx.sessionSkipCounter.update({
          where: { sessionId },
          data: {
            spotifyTrackId: null,
            skipCount: 0,
          },
        });

        return {
          state: this.formatState(updated),
          previousTrackId: existing.spotifyTrackId,
        };
      }),
    );
  }
}

export const skipCounterService = new SkipCounterService();
export const GUEST_SKIP_THRESHOLD = SKIP_THRESHOLD;
