import { Request, Response } from 'express';
import { spotifyService } from '../services/spotify.service';
import { sessionService } from '../services/session.service';
import { playbackService, PLAYBACK_SKIP_POLL_DELAY_MS } from '../services/playback.service';
import { queueService } from '../services/queue.service';
import { playbackTargetService } from '../services/playbackTarget.service';
import { bannedTracksService } from '../services/bannedTracks.service';

export class SpotifyController {
  async getPlaybackToken(req: Request, res: Response) {
    try {
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(userId);
      res.json({ accessToken });
    } catch (error) {
      console.error('Get playback token error:', error);
      res.status(500).json({ error: 'Failed to get playback token' });
    }
  }

  async getUserPlaylists(req: Request, res: Response) {
    try {
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const accessToken = await spotifyService.ensureValidToken(userId);
      const playlists = await spotifyService.getUserPlaylists(accessToken);
      
      res.json({ playlists });
    } catch (error) {
      console.error('Get playlists error:', error);
      res.status(500).json({ error: 'Failed to get playlists' });
    }
  }

  async startPlaylist(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const { playlistUri } = req.body;

      if (!playlistUri) {
        return res.status(400).json({ error: 'playlistUri is required' });
      }

      const accessToken = await spotifyService.ensureValidToken(userId);
      const preference = await playbackTargetService.getPreference(userId);
      
      await spotifyService.startPlaylist(
        playlistUri, 
        accessToken, 
        preference.playbackDeviceId || undefined
      );

      res.json({ message: 'Playlist started' });
    } catch (error) {
      console.error('Start playlist error:', error);
      res.status(500).json({ error: 'Failed to start playlist' });
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
    } catch (error) {
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
    } catch (error) {
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

      res.json({ playback, requester });
    } catch (error) {
      console.error('Get playback error:', error);
      res.status(500).json({ error: 'Failed to get playback state' });
    }
  }

  async play(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
      const preference = await playbackTargetService.getPreference(userId);

      const playbackStarted = await playbackTargetService.transferPlayback(userId, accessToken, true);
      if (!playbackStarted && preference.playbackDeviceId) {
        console.warn('Preferred playback device transfer failed during play request, falling back to direct play.');
      }

      if (!playbackStarted) {
        await spotifyService.play(accessToken, preference.playbackDeviceId || undefined);
      }

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
      const preference = await playbackTargetService.getPreference(userId);
      await spotifyService.pause(accessToken, preference.playbackDeviceId || undefined);

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
      const preference = await playbackTargetService.getPreference(userId);
      await playbackTargetService.transferPlayback(userId, accessToken, true);
      await spotifyService.skipToNext(accessToken, preference.playbackDeviceId || undefined);
      playbackService.requestImmediateSync(sessionId, PLAYBACK_SKIP_POLL_DELAY_MS);

      res.json({ message: 'Skipped to next' });
    } catch (error) {
      console.error('Next error:', error);
      res.status(500).json({ error: 'Failed to skip to next' });
    }
  }

  async listDevices(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const accessToken = await spotifyService.ensureValidToken(userId);
      const result = await playbackTargetService.listDevices(userId, accessToken);
      res.json(result);
    } catch (error: any) {
      console.error('List devices error:', error);
      res.status(500).json({ error: error?.message || 'Failed to list devices' });
    }
  }

  async selectDevice(req: Request, res: Response) {
    try {
      const userId = req.session.userId!;
      const { deviceId } = req.body ?? {};
      const accessToken = await spotifyService.ensureValidToken(userId);

      let device = null;

      try {
        device = await playbackTargetService.selectDevice(userId, accessToken, deviceId ?? null);
      } catch (error: any) {
        console.error('Select device error:', error);
        return res.status(400).json({ error: error?.message || 'Failed to select device' });
      }

      res.json({ device });
    } catch (error) {
      console.error('Select device error:', error);
      res.status(500).json({ error: 'Failed to select device' });
    }
  }
}

export const spotifyController = new SpotifyController();
