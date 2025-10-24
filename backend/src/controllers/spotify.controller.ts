import { Request, Response } from 'express';
import { spotifyService } from '../services/spotify.service';

export class SpotifyController {
  async search(req: Request, res: Response) {
    try {
      const { q } = req.query;
      const userId = req.session.userId!;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }

      const accessToken = await spotifyService.ensureValidToken(userId);
      const tracks = await spotifyService.searchTracks(q, accessToken);

      res.json({ tracks });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search tracks' });
    }
  }

  async getCurrentPlayback(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
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
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
      await spotifyService.skipToNext(accessToken);

      res.json({ message: 'Skipped to next' });
    } catch (error) {
      console.error('Next error:', error);
      res.status(500).json({ error: 'Failed to skip to next' });
    }
  }
}

export const spotifyController = new SpotifyController();
