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
}

const prisma = new PrismaClient();
const SKIP_THRESHOLD = 5;

class SkipCounterService {
  getThreshold() {
    return SKIP_THRESHOLD;
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
    return prisma.$transaction(async (tx) => {
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
    });
  }

  async hasGuestVoted(sessionId: string, trackId: string, guestId: string): Promise<boolean> {
    if (!trackId) {
      return false;
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

  async addVote(sessionId: string, trackId: string, guestId: string): Promise<SkipUpdateResult> {
    if (!trackId) {
      throw new Error('Cannot register skip vote without an active track');
    }

    return prisma.$transaction(async (tx) => {
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

      return {
        state: this.formatState(updatedCounter),
        previousTrackId: counter.spotifyTrackId,
        alreadyVoted: false,
      };
    });
  }

  async removeVote(sessionId: string, trackId: string, guestId: string): Promise<SkipState> {
    if (!trackId) {
      return this.syncCurrentTrack(sessionId, null);
    }

    return prisma.$transaction(async (tx) => {
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
    });
  }

  async reset(sessionId: string): Promise<SkipUpdateResult> {
    return prisma.$transaction(async (tx) => {
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
    });
  }
}

export const skipCounterService = new SkipCounterService();
export const GUEST_SKIP_THRESHOLD = SKIP_THRESHOLD;
