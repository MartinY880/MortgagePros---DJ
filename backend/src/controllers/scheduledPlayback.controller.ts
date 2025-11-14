import { Request, Response } from 'express';
import { scheduledPlaybackService, ScheduledTrackInput } from '../services/scheduledPlayback.service';
import { sessionService } from '../services/session.service';

const MAX_TRACKS_PER_SCHEDULE = 10;

const parseTrackInput = (track: any): ScheduledTrackInput => {
  if (!track || typeof track !== 'object') {
    throw new Error('Invalid track payload');
  }

  const {
    spotifyTrackId,
    spotifyUri,
    trackName,
    trackArtist,
    trackAlbum = null,
    trackImage = null,
    trackDuration,
  } = track;

  if (typeof spotifyTrackId !== 'string' || spotifyTrackId.trim().length === 0) {
    throw new Error('spotifyTrackId is required for each track');
  }

  if (typeof trackName !== 'string' || trackName.trim().length === 0) {
    throw new Error('trackName is required for each track');
  }

  if (typeof trackArtist !== 'string' || trackArtist.trim().length === 0) {
    throw new Error('trackArtist is required for each track');
  }

  const durationNumber = Number(trackDuration);
  if (!Number.isFinite(durationNumber) || durationNumber <= 0) {
    throw new Error('trackDuration must be a positive number');
  }

  const normalizedUri = typeof spotifyUri === 'string' && spotifyUri.trim().length > 0
    ? spotifyUri
    : `spotify:track:${spotifyTrackId}`;

  return {
    spotifyTrackId,
    spotifyUri: normalizedUri,
    trackName,
    trackArtist,
    trackAlbum,
    trackImage,
    trackDuration: Math.round(durationNumber),
  };
};

class ScheduledPlaybackController {
  list = async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;

      const session = await sessionService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const [upcoming, history] = await Promise.all([
        scheduledPlaybackService.listUpcoming(sessionId),
        scheduledPlaybackService.listSessionHistory(sessionId),
      ]);

      res.json({ upcoming, history });
    } catch (error) {
      console.error('Failed to list scheduled playback:', error);
      res.status(500).json({ error: 'Failed to load scheduled playback' });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const hostId = req.session.userId;
      const { timeOfDay, timezoneOffsetMinutes, tracks } = req.body ?? {};

      if (!hostId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (typeof timeOfDay !== 'string' || !/^\d{2}:\d{2}$/.test(timeOfDay)) {
        return res.status(400).json({ error: 'timeOfDay must be provided in HH:mm format' });
      }

      const [hoursStr, minutesStr] = timeOfDay.split(':');
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);

      if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return res.status(400).json({ error: 'timeOfDay must specify a valid hour and minute' });
      }

      const totalMinutes = hours * 60 + minutes;

      const offsetNumber = Number(timezoneOffsetMinutes);
      if (!Number.isFinite(offsetNumber)) {
        return res.status(400).json({ error: 'timezoneOffsetMinutes must be provided as a numeric value' });
      }

      if (!Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ error: 'At least one track is required' });
      }

      if (tracks.length > MAX_TRACKS_PER_SCHEDULE) {
        return res.status(400).json({ error: `A maximum of ${MAX_TRACKS_PER_SCHEDULE} tracks can be scheduled at once` });
      }

      const normalizedTracks = tracks.map(parseTrackInput);

      const scheduledPlayback = await scheduledPlaybackService.scheduleDailyPlayback(
        sessionId,
        hostId,
        totalMinutes,
        offsetNumber,
        normalizedTracks,
      );

      res.status(201).json({ scheduledPlayback });
    } catch (error: any) {
      const message = error?.message ?? 'Failed to schedule playback';
      const status = message.includes('Session not found') ? 404
        : message.includes('Only the host') ? 403
        : 400;

      console.error('Failed to create scheduled playback:', error);
      res.status(status).json({ error: message });
    }
  };

  cancel = async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;
      const hostId = req.session.userId;

      if (!hostId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const cancelled = await scheduledPlaybackService.cancelSchedule(scheduleId, hostId);

      res.json({ scheduledPlayback: cancelled });
    } catch (error: any) {
      const message = error?.message ?? 'Failed to cancel scheduled playback';
      const status = message.includes('not found') ? 404
        : message.includes('Only the host') ? 403
        : message.includes('pending') ? 400
        : 500;

      console.error('Failed to cancel scheduled playback:', error);
      res.status(status).json({ error: message });
    }
  };
}

export const scheduledPlaybackController = new ScheduledPlaybackController();
