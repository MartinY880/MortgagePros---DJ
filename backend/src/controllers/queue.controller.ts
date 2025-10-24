import { Request, Response } from 'express';
import { queueService } from '../services/queue.service';
import { spotifyService } from '../services/spotify.service';

export class QueueController {
  async add(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { spotifyTrackId } = req.body;
      const userId = req.session.userId!;

      if (!spotifyTrackId) {
        return res.status(400).json({ error: 'Track ID is required' });
      }

      // Get track details from Spotify
      const accessToken = await spotifyService.ensureValidToken(userId);
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
        userId
      );

      res.json({ queueItem });
    } catch (error: any) {
      console.error('Add to queue error:', error);
      res.status(error.message === 'Track already in queue' ? 400 : 500)
        .json({ error: error.message || 'Failed to add to queue' });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const queue = await queueService.getQueue(sessionId);
      res.json({ queue });
    } catch (error) {
      console.error('Get queue error:', error);
      res.status(500).json({ error: 'Failed to get queue' });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const { queueItemId } = req.params;
      const userId = req.session.userId!;

      await queueService.removeFromQueue(queueItemId, userId);
      res.json({ message: 'Removed from queue' });
    } catch (error: any) {
      console.error('Remove from queue error:', error);
      res.status(error.message === 'Not authorized to remove this track' ? 403 : 500)
        .json({ error: error.message || 'Failed to remove from queue' });
    }
  }

  async vote(req: Request, res: Response) {
    try {
      const { queueItemId } = req.params;
      const { voteType } = req.body;
      const userId = req.session.userId!;

      if (voteType !== 1 && voteType !== -1) {
        return res.status(400).json({ error: 'Vote type must be 1 or -1' });
      }

      const result = await queueService.vote(queueItemId, userId, voteType);
      res.json(result);
    } catch (error) {
      console.error('Vote error:', error);
      res.status(500).json({ error: 'Failed to vote' });
    }
  }
}

export const queueController = new QueueController();
