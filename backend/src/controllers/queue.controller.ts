import { Request, Response } from 'express';
import { queueService } from '../services/queue.service';
import { spotifyService } from '../services/spotify.service';
import { sessionService } from '../services/session.service';

export class QueueController {
  private resolveSessionActor = async (req: Request, sessionId: string) => {
    const session = await sessionService.getSession(sessionId);

    if (!session || !session.isActive) {
      return { error: 'Session not found or inactive' } as const;
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

  add = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { spotifyTrackId } = req.body;

      if (!spotifyTrackId) {
        return res.status(400).json({ error: 'Track ID is required' });
      }

      const context = await this.resolveSessionActor(req, sessionId);

      if ('error' in context) {
        return res.status(context.error === 'Session not found or inactive' ? 404 : 401)
          .json({ error: context.error });
      }

      const { session, actor, role } = context;

      // Guests use the host's Spotify credentials
      const accessToken = await spotifyService.ensureValidToken(session.hostId);
      const track = await spotifyService.getTrack(spotifyTrackId, accessToken);

      // Add to queue
      const queueItem = await queueService.addToQueue(
        sessionId,
        track.id,
        track.name,
        track.artists.map((a: any) => a.name).join(', '),
        track.album.name,
        track.album.images[0]?.url || null,
        track.duration_ms,
        actor
      );

      // Also push to the host's Spotify playback queue when possible
      if (track.uri) {
        try {
          await spotifyService.addToQueue(track.uri, accessToken);
        } catch (queueError) {
          console.warn('Failed to add track to Spotify playback queue:', queueError);
        }
      }

      res.json({ queueItem, role });
    } catch (error: any) {
      console.error('Add to queue error:', error);
      res.status(error.message === 'Track already in queue' ? 400 : 500)
        .json({ error: error.message || 'Failed to add to queue' });
    }
  };

  get = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const queue = await queueService.getQueue(sessionId);
      res.json({ queue });
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
      res.json({ message: 'Removed from queue' });
    } catch (error: any) {
      console.error('Remove from queue error:', error);
      res.status(error.message === 'Not authorized to remove this track' ? 403 : 500)
        .json({ error: error.message || 'Failed to remove from queue' });
    }
  };

  vote = async (req: Request, res: Response) => {
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

      const result = await queueService.vote(queueItemId, context.actor, voteType);
      res.json(result);
    } catch (error) {
      console.error('Vote error:', error);
      res.status(500).json({ error: 'Failed to vote' });
    }
  };
}

export const queueController = new QueueController();
