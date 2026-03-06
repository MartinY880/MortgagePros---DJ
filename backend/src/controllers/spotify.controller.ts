import { Request, Response } from 'express';
import { spotifyService } from '../services/spotify.service';
import { sessionService } from '../services/session.service';
import { playbackService, PLAYBACK_SKIP_POLL_DELAY_MS } from '../services/playback.service';
import { queueService } from '../services/queue.service';
import { bannedTracksService } from '../services/bannedTracks.service';
import { creditService, CreditError, CreditState, VOTE_REACTION_COST } from '../services/credit.service';
import { skipCounterService } from '../services/skipCounter.service';

/**
 * Detect Spotify 429 rate-limit or network timeout errors and return
 * an appropriate HTTP response instead of a generic 500.
 * Returns `true` if the error was handled, `false` otherwise.
 */
function handleSpotifyTransientError(error: any, res: Response, label: string): boolean {
  const statusCode = error?.statusCode ?? error?.response?.status ?? error?.status ?? error?.body?.statusCode;

  if (statusCode === 429) {
    const retryAfter = error?.retryAfter
      ?? error?.headers?.['retry-after']
      ?? error?.response?.headers?.['retry-after']
      ?? error?.body?.retry_after
      ?? '1';
    console.warn(`${label}: Spotify 429 – retry-after ${retryAfter}s`);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Spotify rate limit – please try again shortly', retryAfter: Number(retryAfter) || 1 });
    return true;
  }

  const code = error?.code ?? error?.cause?.code;
  if (code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'ECONNRESET') {
    console.warn(`${label}: Spotify network error (${code})`);
    res.status(503).json({ error: 'Spotify is temporarily unreachable – please try again' });
    return true;
  }

  return false;
}

export class SpotifyController {
  async getPlaybackToken(req: Request, res: Response) {
    try {
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(userId);
      res.json({ accessToken });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Get playback token')) return;
      console.error('Get playback token error:', error);
      res.status(500).json({ error: 'Failed to get playback token' });
    }
  }

  async search(req: Request, res: Response) {
    try {
      const { q, sessionId, hideRestricted, offset, limit } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }

      let tokenOwnerId: string | null = null;
      let session: Awaited<ReturnType<typeof sessionService.getSession>> | null = null;

      if (sessionId && typeof sessionId === 'string') {
        session = await sessionService.getSession(sessionId);

        if (!session || !session.isActive) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Verify this session is the host's currently active session
        const mostRecentSession = await sessionService.getMostRecentSession(session.hostId);
        if (!mostRecentSession || mostRecentSession.id !== sessionId) {
          return res.status(404).json({ error: 'This session is no longer active. The host has started a new session.' });
        }

        const isHost = req.session.userId === session.hostId;
        const guestData = req.session.guestSessions?.[sessionId];

        if (!isHost && !guestData) {
          return res.status(401).json({ error: 'Join the session before searching' });
        }

        tokenOwnerId = session.hostId;
        if (session.isActive) {
          playbackService.ensureMonitor(sessionId, session.hostId);
        }
      } else if (req.session.userId) {
        tokenOwnerId = req.session.userId;
      }

      if (!tokenOwnerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(tokenOwnerId);
      const parsedLimit = typeof limit === 'string' ? Number.parseInt(limit, 10) : NaN;
      const parsedOffset = typeof offset === 'string' ? Number.parseInt(offset, 10) : NaN;

      const pagination = {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
      };

      const trackPage = await spotifyService.searchTracks(q, accessToken, pagination);
      const rawTracks = trackPage.items;

      let bannedTrackIds: string[] = [];
      let bannedArtistIds: string[] = [];

      if (sessionId && typeof sessionId === 'string') {
        [bannedTrackIds, bannedArtistIds] = await Promise.all([
          bannedTracksService.getBannedTrackIdsForSession(sessionId),
          bannedTracksService.getBannedArtistIdsForSession(sessionId),
        ]);
      }

      const shouldHideRestricted = hideRestricted === 'true';
      const allowExplicit = session?.allowExplicit ?? true;
      const maxSongDuration = session?.maxSongDuration ?? null;

      const filteredTracks = shouldHideRestricted
        ? rawTracks.filter((track: any) => {
            if (!allowExplicit && track?.explicit) {
              return false;
            }

            if (bannedTrackIds.includes(track?.id)) {
              return false;
            }

            const artistIds = Array.isArray(track?.artists)
              ? track.artists.map((artist: any) => artist?.id).filter(Boolean)
              : [];

            if (artistIds.some((artistId: string) => bannedArtistIds.includes(artistId))) {
              return false;
            }

            // Filter by max song duration
            if (maxSongDuration && track?.duration_ms) {
              const trackDurationMinutes = track.duration_ms / 60000;
              if (trackDurationMinutes > maxSongDuration) {
                return false;
              }
            }

            return true;
          })
        : rawTracks;

      const filteredOutCount = rawTracks.length - filteredTracks.length;
      const pageLimit = trackPage.limit ?? filteredTracks.length;
      const pageOffset = trackPage.offset ?? pagination.offset ?? 0;
      const total = trackPage.total ?? filteredTracks.length;
      const nextOffsetCandidate = pageOffset + pageLimit;
      const hasMore = nextOffsetCandidate < total;

      res.json({
        tracks: filteredTracks,
        bannedTrackIds,
        bannedArtistIds,
        meta: {
          total,
          offset: pageOffset,
          limit: pageLimit,
          nextOffset: hasMore ? nextOffsetCandidate : null,
          hasMore,
          filteredOutCount,
        },
      });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Search')) return;
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search tracks' });
    }
  }

  async searchArtists(req: Request, res: Response) {
    try {
      const { q, sessionId } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }

      let tokenOwnerId: string | null = null;

      if (sessionId && typeof sessionId === 'string') {
        const session = await sessionService.getSession(sessionId);

        if (!session || !session.isActive) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Verify this session is the host's currently active session
        const mostRecentSession = await sessionService.getMostRecentSession(session.hostId);
        if (!mostRecentSession || mostRecentSession.id !== sessionId) {
          return res.status(404).json({ error: 'This session is no longer active. The host has started a new session.' });
        }

        const isHost = req.session.userId === session.hostId;
        const guestData = req.session.guestSessions?.[sessionId];

        if (!isHost && !guestData) {
          return res.status(401).json({ error: 'Join the session before searching' });
        }

        tokenOwnerId = session.hostId;
        if (session.isActive) {
          playbackService.ensureMonitor(sessionId, session.hostId);
        }
      } else if (req.session.userId) {
        tokenOwnerId = req.session.userId;
      }

      if (!tokenOwnerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(tokenOwnerId);
      const artists = await spotifyService.searchArtists(q, accessToken);

      let bannedArtistIds: string[] = [];

      if (sessionId && typeof sessionId === 'string') {
        bannedArtistIds = await bannedTracksService.getBannedArtistIdsForSession(sessionId);
      }

      res.json({ artists, bannedArtistIds });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Artist search')) return;
      console.error('Artist search error:', error);
      res.status(500).json({ error: 'Failed to search artists' });
    }
  }

  async getCurrentPlayback(req: Request, res: Response) {
    try {
      const { sessionId } = req.query;

      let tokenOwnerId: string | null = null;

      if (sessionId && typeof sessionId === 'string') {
        const session = await sessionService.getSession(sessionId);

        if (!session || !session.isActive) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Verify this session is the host's currently active session
        const mostRecentSession = await sessionService.getMostRecentSession(session.hostId);
        if (!mostRecentSession || mostRecentSession.id !== sessionId) {
          return res.status(404).json({ error: 'This session is no longer active. The host has started a new session.' });
        }

        const isHost = req.session.userId === session.hostId;
        const guestData = req.session.guestSessions?.[sessionId];

        if (!isHost && !guestData) {
          return res.status(401).json({ error: 'Join the session before viewing playback' });
        }

        tokenOwnerId = session.hostId;
        if (session.isActive) {
          playbackService.ensureMonitor(sessionId, session.hostId);
        }
      } else if (req.session.userId) {
        tokenOwnerId = req.session.userId;
      }

      if (!tokenOwnerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(tokenOwnerId);
      const playback = await spotifyService.getCurrentPlayback(accessToken);

      let requester: { type: 'host' | 'guest' | 'unknown'; name: string } | null = null;

      const resolvedSessionId = typeof sessionId === 'string' ? sessionId : null;

      if (resolvedSessionId && playback?.item?.id) {
        const queueItem = await queueService.getMostRecentQueueItemForTrack(resolvedSessionId, playback.item.id);

        if (queueItem?.addedBy) {
          requester = { type: 'host', name: queueItem.addedBy.displayName };
        } else if (queueItem?.addedByGuest) {
          requester = { type: 'guest', name: queueItem.addedByGuest.name };
        } else if (queueItem) {
          requester = { type: 'unknown', name: 'Unknown' };
        }
      }

      let skipState: Awaited<ReturnType<typeof skipCounterService.syncCurrentTrack>> | null = null;

      if (resolvedSessionId) {
        try {
          skipState = await skipCounterService.syncCurrentTrack(resolvedSessionId, playback?.item?.id ?? null);
        } catch (skipError) {
          console.error('Skip counter sync error:', skipError);
        }
      }

      // Return playback state (may be null if no active playback)
      res.json({ playback: playback || null, requester, skip: skipState });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Get playback')) return;
      console.error('Get playback error:', error);
      // Return null playback instead of error to prevent "unavailable" message
      res.json({ playback: null, requester: null });
    }
  }

  async play(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);

      await spotifyService.play(accessToken);

      res.json({ message: 'Playing' });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Play')) return;
      console.error('Play error:', error);
      res.status(500).json({ error: 'Failed to play' });
    }
  }

  async pause(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
      await spotifyService.pause(accessToken);

      res.json({ message: 'Paused' });
    } catch (error: any) {
      if (handleSpotifyTransientError(error, res, 'Pause')) return;
      console.error('Pause error:', error);
      res.status(500).json({ error: 'Failed to pause' });
    }
  }

  async next(req: Request, res: Response) {
    let spentSkipCredits: { amount: number; authUserId: string } | null = null;

    try {
      const { sessionId } = req.body;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required to skip tracks' });
      }

      const session = await sessionService.getSession(sessionId);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found or inactive' });
      }

      const mostRecentSession = await sessionService.getMostRecentSession(session.hostId);
      if (!mostRecentSession || mostRecentSession.id !== sessionId) {
        return res.status(404).json({ error: 'This session is no longer active. The host has started a new session.' });
      }

      const isHost = req.session.userId === session.hostId;
      let authUserId: string | null = null;
      let actorCredits: CreditState | null = null;

      playbackService.ensureMonitor(sessionId, session.hostId);

      const accessToken = await spotifyService.ensureValidToken(session.hostId);
      const playback = await spotifyService.getCurrentPlayback(accessToken);

      if (!playback?.item?.id) {
        return res.status(409).json({ error: 'No active track to skip' });
      }

      const currentTrackId = playback.item.id;

      if (isHost) {
        await spotifyService.skipToNext(accessToken);
        const resetResult = await skipCounterService.reset(sessionId);
        skipCounterService.resetGate(sessionId);
        playbackService.requestImmediateSync(sessionId, PLAYBACK_SKIP_POLL_DELAY_MS);

        return res.json({
          message: 'Skipped to next',
          skip: {
            ...resetResult.state,
            triggered: true,
            previousTrackId: currentTrackId,
          },
        });
      }

      const guestSession = req.session.guestSessions?.[sessionId];

      if (!guestSession) {
        return res.status(401).json({ error: 'Join the session before skipping tracks' });
      }

      const guest = await sessionService.getGuestById(guestSession.guestId);

      if (!guest || guest.sessionId !== sessionId) {
        if (req.session.guestSessions) {
          delete req.session.guestSessions[sessionId];
        }
        return res.status(401).json({ error: 'Join the session before skipping tracks' });
      }

      // Sync the in-memory gate with the current track (cheap — skips DB if already in sync)
      await skipCounterService.syncCurrentTrack(sessionId, currentTrackId);

      authUserId = req.auth?.userId ?? guest.clerkUserId ?? null;

      if (!authUserId) {
        return res.status(401).json({ error: 'Sign in to spend credits on skip votes' });
      }

      try {
        const credits = await creditService.spendCredits(authUserId, VOTE_REACTION_COST, req.auth?.roles);
        spentSkipCredits = { amount: VOTE_REACTION_COST, authUserId };

        if (authUserId === req.auth?.userId) {
          actorCredits = credits;
        }
      } catch (error) {
        if (error instanceof CreditError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }

      const voteResult = await skipCounterService.addVote(sessionId, currentTrackId, guest.id);

      // Track changed between the playback fetch and the vote — refund and bail
      if (voteResult.trackMismatch) {
        if (spentSkipCredits) {
          await creditService.addCredits(spentSkipCredits.authUserId, spentSkipCredits.amount);
          spentSkipCredits = null;
        }
        return res.status(409).json({
          error: 'The track changed before your skip vote was processed',
          skip: { ...voteResult.state, triggered: false, previousTrackId: null },
        });
      }

      // Threshold was already reached — song should skip momentarily, refund
      if (voteResult.thresholdAlreadyReached) {
        if (spentSkipCredits) {
          await creditService.addCredits(spentSkipCredits.authUserId, spentSkipCredits.amount);
          spentSkipCredits = null;
        }
        return res.status(409).json({
          error: 'Enough skip votes have already been cast — the track is being skipped',
          skip: { ...voteResult.state, triggered: false, previousTrackId: null },
        });
      }

      if (voteResult.alreadyVoted) {
        const credits = await creditService.addCredits(authUserId, VOTE_REACTION_COST);
        spentSkipCredits = null;

        if (authUserId === req.auth?.userId) {
          actorCredits = credits;
        }

        const conflictPayload: Record<string, unknown> = {
          error: 'You have already voted to skip this track',
          skip: {
            ...voteResult.state,
            triggered: false,
            previousTrackId: null,
          },
        };

        if (actorCredits) {
          conflictPayload.credits = actorCredits;
        }

        return res.status(409).json(conflictPayload);
      }

      const thresholdReached = voteResult.state.skipCount >= skipCounterService.getThreshold();

      if (thresholdReached) {
        try {
          await spotifyService.skipToNext(accessToken);
          const resetResult = await skipCounterService.reset(sessionId);
          skipCounterService.resetGate(sessionId);
          playbackService.requestImmediateSync(sessionId, PLAYBACK_SKIP_POLL_DELAY_MS);
          spentSkipCredits = null;

          const triggeredPayload: Record<string, unknown> = {
            message: 'Skip threshold reached. Track skipped.',
            skip: {
              ...resetResult.state,
              triggered: true,
              previousTrackId: currentTrackId,
            },
          };

          if (actorCredits) {
            triggeredPayload.credits = actorCredits;
          }

          return res.json(triggeredPayload);
        } catch (spotifyError) {
          await skipCounterService.removeVote(sessionId, currentTrackId, guest.id);
          throw spotifyError;
        }
      }

      spentSkipCredits = null;
      playbackService.requestImmediateSync(sessionId);

      const payload: Record<string, unknown> = {
        message: 'Skip vote recorded',
        skip: {
          ...voteResult.state,
          triggered: false,
          previousTrackId: null,
        },
      };

      if (actorCredits) {
        payload.credits = actorCredits;
      }

      return res.json(payload);
    } catch (error: any) {
      console.error('Next error:', error);

      if (spentSkipCredits) {
        const { authUserId: refundUserId, amount } = spentSkipCredits;
        try {
          await creditService.addCredits(refundUserId, amount);
        } catch (refundError) {
          console.error('Failed to refund skip credits after error:', refundError);
        }
        spentSkipCredits = null;
      }

      if (error instanceof CreditError) {
        return res.status(error.status).json({ error: error.message });
      }

      if (handleSpotifyTransientError(error, res, 'Next')) return;

      res.status(500).json({ error: 'Failed to skip to next' });
    }
  }
}

export const spotifyController = new SpotifyController();
