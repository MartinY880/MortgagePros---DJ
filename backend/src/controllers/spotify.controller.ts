import { Request, Response } from 'express';
import { spotifyService } from '../services/spotify.service';
import { sessionService } from '../services/session.service';
import { playbackService, PLAYBACK_SKIP_POLL_DELAY_MS } from '../services/playback.service';

export class SpotifyController {
  async search(req: Request, res: Response) {
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
      const tracks = await spotifyService.searchTracks(q, accessToken);

      res.json({ tracks });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search tracks' });
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

      res.json({ playback });
    } catch (error) {
      console.error('Get playback error:', error);
      res.status(500).json({ error: 'Failed to get playback state' });
    }
  }

  async play(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
      await spotifyService.play(accessToken);

      res.json({ message: 'Playing' });
    } catch (error) {
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
    } catch (error) {
      console.error('Pause error:', error);
      res.status(500).json({ error: 'Failed to pause' });
    }
  }

  async next(req: Request, res: Response) {
    try {
      const { sessionId } = req.body;
      const userId = req.session.userId!;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required to skip tracks' });
      }

      const session = await sessionService.getSession(sessionId);

      if (!session || !session.isActive) {
        return res.status(404).json({ error: 'Session not found or inactive' });
      }

      if (session.hostId !== userId) {
        return res.status(403).json({ error: 'Only the host can skip tracks' });
      }

      playbackService.ensureMonitor(sessionId, session.hostId);

      const accessToken = await spotifyService.ensureValidToken(userId);
      await spotifyService.skipToNext(accessToken);
  playbackService.requestImmediateSync(sessionId, PLAYBACK_SKIP_POLL_DELAY_MS);

      res.json({ message: 'Skipped to next' });
    } catch (error) {
      console.error('Next error:', error);
      res.status(500).json({ error: 'Failed to skip to next' });
    }
  }
}

export const spotifyController = new SpotifyController();
