import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';
import { bannedTracksService, BannedTrackInput, BannedArtistInput } from '../services/bannedTracks.service';

class BannedTrackController {
  private async requireHost(req: Request, sessionId: string) {
    const session = await sessionService.getSession(sessionId);

    if (!session || !session.isActive) {
      return { error: 'Session not found or inactive' } as const;
    }

    if (req.session.userId !== session.hostId) {
      return { error: 'Only the host can manage banned tracks', status: 403 } as const;
    }

    return { session } as const;
  }

  list = async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      const lists = await bannedTracksService.getListsForSession(sessionId);
      const [bannedTrackIds, bannedArtistIds] = await Promise.all([
        bannedTracksService.getBannedTrackIdsForSession(sessionId),
        bannedTracksService.getBannedArtistIdsForSession(sessionId),
      ]);

      res.json({ lists, bannedTrackIds, bannedArtistIds });
    } catch (error) {
      console.error('Failed to load banned track lists:', error);
      res.status(500).json({ error: 'Failed to load banned tracks' });
    }
  };

  createList = async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const { name } = req.body ?? {};
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      const { session } = result;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'List name is required' });
      }

      const list = await bannedTracksService.createList(session.hostId, name);
      res.status(201).json({ list });
    } catch (error: any) {
      console.error('Failed to create banned track list:', error);
      res.status(400).json({ error: error.message || 'Failed to create list' });
    }
  };

  addTrack = async (req: Request, res: Response) => {
    try {
      const { id: sessionId, listId } = req.params;
      const { track } = req.body ?? {};
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      const { session } = result;

      if (!track) {
        return res.status(400).json({ error: 'Track payload is required' });
      }

      const trackPayload: BannedTrackInput = {
        spotifyTrackId: track.spotifyTrackId,
        trackName: track.trackName,
        trackArtist: track.trackArtist,
        trackAlbum: track.trackAlbum ?? null,
        trackImage: track.trackImage ?? null,
      };

      if (!trackPayload.spotifyTrackId || !trackPayload.trackName || !trackPayload.trackArtist) {
        return res.status(400).json({ error: 'Track payload is invalid' });
      }

      const record = await bannedTracksService.addTrack(sessionId, listId, session.hostId, trackPayload);
      res.status(201).json({ track: record });
    } catch (error: any) {
      console.error('Failed to add track to banned list:', error);
      res.status(400).json({ error: error.message || 'Failed to add track' });
    }
  };

  removeTrack = async (req: Request, res: Response) => {
    try {
      const { id: sessionId, listId, trackId } = req.params;
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      await bannedTracksService.removeTrack(sessionId, listId, trackId);
      res.json({ message: 'Track removed' });
    } catch (error: any) {
      console.error('Failed to remove track from banned list:', error);
      res.status(400).json({ error: error.message || 'Failed to remove track' });
    }
  };

  addArtist = async (req: Request, res: Response) => {
    try {
      const { id: sessionId, listId } = req.params;
      const { artist } = req.body ?? {};
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      const { session } = result;

      if (!artist) {
        return res.status(400).json({ error: 'Artist payload is required' });
      }

      const artistPayload: BannedArtistInput = {
        spotifyArtistId: artist.spotifyArtistId,
        artistName: artist.artistName,
        artistImage: artist.artistImage ?? null,
      };

      if (!artistPayload.spotifyArtistId || !artistPayload.artistName) {
        return res.status(400).json({ error: 'Artist payload is invalid' });
      }

      const record = await bannedTracksService.addArtist(sessionId, listId, session.hostId, artistPayload);
      res.status(201).json({ artist: record });
    } catch (error: any) {
      console.error('Failed to add artist to banned list:', error);
      res.status(400).json({ error: error.message || 'Failed to add artist' });
    }
  };

  removeArtist = async (req: Request, res: Response) => {
    try {
      const { id: sessionId, listId, artistId } = req.params;
      const result = await this.requireHost(req, sessionId);

      if ('error' in result) {
        return res.status(result.status ?? 404).json({ error: result.error });
      }

      await bannedTracksService.removeArtist(sessionId, listId, artistId);
      res.json({ message: 'Artist removed' });
    } catch (error: any) {
      console.error('Failed to remove artist from banned list:', error);
      res.status(400).json({ error: error.message || 'Failed to remove artist' });
    }
  };
}

export const bannedTrackController = new BannedTrackController();
