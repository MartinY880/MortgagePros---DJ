import { Request, Response } from 'express';
import { queueService } from '../services/queue.service';
import { spotifyService } from '../services/spotify.service';
import { sessionService } from '../services/session.service';
import { playbackService } from '../services/playback.service';
import { broadcastQueueUpdate } from '../sockets/handlers';
import { Server as SocketIOServer } from 'socket.io';
import { creditService, CreditError, CreditState, GUEST_TRACK_COST, VOTE_REACTION_COST } from '../services/credit.service';
import { playbackTargetService } from '../services/playbackTarget.service';

export class QueueController {
  private resolveSessionActor = async (req: Request, sessionId: string) => {
    const session = await sessionService.getSession(sessionId);

    if (!session || !session.isActive) {
      return { error: 'Session not found or inactive' } as const;
    }

    // Verify this session is the host's currently active session
    const mostRecentSession = await sessionService.getMostRecentSession(session.hostId);
    if (!mostRecentSession || mostRecentSession.id !== sessionId) {
      return { error: 'This session is no longer active. The host has started a new session.' } as const;
    }

    const isHost = req.session.userId === session.hostId;
    const guestData = req.session.guestSessions?.[sessionId];
    let guestId: string | undefined;

    if (!isHost) {
      if (!guestData) {
        return { error: 'Join the session before interacting with the queue' } as const;
      }

      const guest = await sessionService.getGuestById(guestData.guestId);

      if (!guest || guest.sessionId !== sessionId) {
        if (req.session.guestSessions) {
          delete req.session.guestSessions[sessionId];
        }
        return { error: 'Join the session before interacting with the queue' } as const;
      }

      guestId = guest.id;
    }

    if (!isHost && !guestId) {
      return { error: 'Join the session before interacting with the queue' } as const;
    }

    const actor = isHost
      ? { userId: session.hostId }
      : { guestId: guestId! };

    return {
      session,
      actor,
      role: isHost ? 'host' as const : 'guest' as const,
    } as const;
  };

  private async emitQueueState(req: Request, sessionId: string) {
    const state = await queueService.getQueueWithNext(sessionId);
    const io = req.app.get('io') as SocketIOServer | undefined;

    if (io) {
      broadcastQueueUpdate(io, sessionId, state);
    }

    return state;
  }

  add = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { spotifyTrackId } = req.body;

      if (!spotifyTrackId) {
        return res.status(400).json({ error: 'Track ID is required' });
      }

      if ((req as any)._spentCreditsForQueue) {
        delete (req as any)._spentCreditsForQueue;
      }

      const context = await this.resolveSessionActor(req, sessionId);

      if ('error' in context) {
        return res.status(context.error === 'Session not found or inactive' ? 404 : 401)
          .json({ error: context.error });
      }

      const { session, actor, role } = context;
      const allowExplicit = (session as any).allowExplicit ?? true;
      const queuedBefore = await queueService.countActiveQueueItems(sessionId);
      const clerkUserId = req.auth?.userId ?? null;
      let guestCreditState: CreditState | null = null;

      playbackService.ensureMonitor(sessionId, session.hostId);

      // Guests use the host's Spotify credentials
      const accessToken = await spotifyService.ensureValidToken(session.hostId);
      const track = await spotifyService.getTrack(spotifyTrackId, accessToken);

      if (!allowExplicit && track.explicit) {
        return res.status(400).json({ error: 'Explicit tracks are disabled for this session' });
      }

      if (role === 'guest') {
        if (!clerkUserId) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
          guestCreditState = await creditService.spendCredits(clerkUserId, GUEST_TRACK_COST);
          (req as any)._spentCreditsForQueue = {
            amount: GUEST_TRACK_COST,
            clerkUserId,
          };
        } catch (error) {
          if (error instanceof CreditError) {
            return res.status(error.status).json({ error: error.message });
          }
          throw error;
        }
      }

      // Add to queue
      const artistIds = (track.artists ?? []).map((a: any) => a.id).filter((id: string | null | undefined) => Boolean(id)) as string[];
      const queueItem = await queueService.addToQueue(
        sessionId,
        track.id,
        track.name,
        track.artists.map((a: any) => a.name).join(', '),
        track.album.name,
        track.album.images[0]?.url || null,
        track.duration_ms,
        artistIds,
        actor
      );

      const state = await this.emitQueueState(req, sessionId);

      // Push to playback device queue only if this is the first upcoming track
      if (queuedBefore === 0 && state.nextUp && state.nextUp.id === queueItem.id) {
        const trackUri = track.uri || `spotify:track:${track.id}`;
        try {
          await playbackTargetService.queueTrack(session.hostId, accessToken, trackUri, { autoTransfer: true });
          playbackService.recordManualQueue(sessionId, queueItem.id);
        } catch (queueError) {
          console.warn('Failed to add track to Spotify playback queue:', queueError);
        }
      }

      playbackService.requestImmediateSync(sessionId);

      const payload: Record<string, unknown> = {
        queueItem,
        role,
        nextUp: state.nextUp,
        queue: state.queue,
      };

      if (guestCreditState) {
        payload.credits = guestCreditState;
      }

      if ((req as any)._spentCreditsForQueue) {
        delete (req as any)._spentCreditsForQueue;
      }

      res.json(payload);
    } catch (error: any) {
      console.error('Add to queue error:', error);

      if (error instanceof CreditError) {
        return res.status(error.status).json({ error: error.message });
      }

      const spentInfo = (req as any)._spentCreditsForQueue as { amount: number; clerkUserId: string } | undefined;
      if (spentInfo) {
        try {
          await creditService.addCredits(spentInfo.clerkUserId, spentInfo.amount);
        } catch (refundError) {
          console.error('Failed to refund credits after queue error:', refundError);
        } finally {
          delete (req as any)._spentCreditsForQueue;
        }
      }

      const knownClientErrorMessages = new Set([
        'Track already in queue',
        'Track has been banned by the host',
      ]);

      const isArtistBanError = typeof error.message === 'string' && error.message.startsWith('Artist "') && error.message.endsWith('has been banned by the host');
      const status = knownClientErrorMessages.has(error.message) || isArtistBanError ? 400 : 500;

      res.status(status)
        .json({ error: error.message || 'Failed to add to queue' });
    }
  };

  get = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await sessionService.getSession(sessionId);
      if (session?.isActive) {
        playbackService.ensureMonitor(sessionId, session.hostId);
      }
      const state = await queueService.getQueueWithNext(sessionId);
      res.json(state);
    } catch (error) {
      console.error('Get queue error:', error);
      res.status(500).json({ error: 'Failed to get queue' });
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      const { queueItemId } = req.params;

      const queueItem = await queueService.getQueueItemWithSession(queueItemId);

      if (!queueItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      const context = await this.resolveSessionActor(req, queueItem.sessionId);

      if ('error' in context) {
        return res.status(context.error === 'Session not found or inactive' ? 404 : 403)
          .json({ error: context.error });
      }

      await queueService.removeFromQueue(queueItemId, context.actor);

      const queueItemData = queueItem as any;
      let actorCredits: CreditState | null = null;
      const removingClerkUserId = req.auth?.userId;
      let guestClerkUserId = queueItemData.addedByGuest?.clerkUserId ?? null;

      if (!guestClerkUserId && queueItem.addedByGuestId) {
        try {
          const guestRecord = await sessionService.getGuestById(queueItem.addedByGuestId);
          guestClerkUserId = guestRecord?.clerkUserId ?? null;
        } catch (lookupError) {
          console.error('Failed to resolve guest Clerk ID for refund:', lookupError);
        }
      }

      if (guestClerkUserId) {
        try {
          const credits = await creditService.addCredits(guestClerkUserId, GUEST_TRACK_COST);
          if (removingClerkUserId && removingClerkUserId === guestClerkUserId) {
            actorCredits = credits;
          }
        } catch (refundError) {
          console.error('Failed to refund credits after queue removal:', refundError);
        }
      }

      if (queueItem.session.isActive) {
        playbackService.ensureMonitor(queueItem.sessionId, queueItem.session.hostId);
      }
      const state = await this.emitQueueState(req, queueItem.sessionId);
      playbackService.requestImmediateSync(queueItem.sessionId);
      const payload: Record<string, unknown> = {
        message: 'Removed from queue',
        nextUp: state.nextUp,
        queue: state.queue,
      };

      if (actorCredits) {
        payload.credits = actorCredits;
      }

      res.json(payload);
    } catch (error: any) {
      console.error('Remove from queue error:', error);
      res.status(error.message === 'Not authorized to remove this track' ? 403 : 500)
        .json({ error: error.message || 'Failed to remove from queue' });
    }
  };

  vote = async (req: Request, res: Response) => {
    let spentVoteCredits: { amount: number; clerkUserId: string } | null = null;

    try {
      const { queueItemId } = req.params;
      const { voteType } = req.body;

      if (voteType !== 1 && voteType !== -1) {
        return res.status(400).json({ error: 'Vote type must be 1 or -1' });
      }

      const queueItem = await queueService.getQueueItemWithSession(queueItemId);

      if (!queueItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      const context = await this.resolveSessionActor(req, queueItem.sessionId);

      if ('error' in context) {
        return res.status(context.error === 'Session not found or inactive' ? 404 : 401)
          .json({ error: context.error });
      }

      const { actor, role } = context;

      let clerkUserId: string | null = null;
      let actorCredits: CreditState | null = null;

      if (role === 'host') {
        clerkUserId = req.auth?.userId ?? null;
      } else if (role === 'guest' && actor.guestId) {
        const guest = await sessionService.getGuestById(actor.guestId);
        clerkUserId = guest?.clerkUserId ?? null;
      }

      const result = await queueService.vote(queueItemId, actor, voteType, {
        beforeChange: async (intent) => {
          if (!clerkUserId || intent.action !== 'add') {
            return;
          }

          const credits = await creditService.spendCredits(clerkUserId, VOTE_REACTION_COST);
          spentVoteCredits = { amount: VOTE_REACTION_COST, clerkUserId };

          if (clerkUserId === req.auth?.userId) {
            actorCredits = credits;
          }
        },
      });

      if (result.action === 'removed' && clerkUserId) {
        const credits = await creditService.addCredits(clerkUserId, VOTE_REACTION_COST);
        if (clerkUserId === req.auth?.userId) {
          actorCredits = credits;
        }
      }

      spentVoteCredits = null;

      const state = await this.emitQueueState(req, queueItem.sessionId);
      playbackService.requestImmediateSync(queueItem.sessionId);

      const payload: Record<string, unknown> = {
        ...result,
        nextUp: state.nextUp,
        queue: state.queue,
      };

      if (actorCredits) {
        payload.credits = actorCredits;
      }

      res.json(payload);
    } catch (error) {
      console.error('Vote error:', error);

      if (spentVoteCredits) {
        const { clerkUserId: refundUserId, amount } = spentVoteCredits;
        try {
          await creditService.addCredits(refundUserId, amount);
        } catch (refundError) {
          console.error('Failed to refund vote credits after error:', refundError);
        }
        spentVoteCredits = null;
      }

      if (error instanceof CreditError) {
        return res.status(error.status).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to vote' });
    }
  };
}

export const queueController = new QueueController();
