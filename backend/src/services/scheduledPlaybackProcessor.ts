import { scheduledPlaybackService } from './scheduledPlayback.service';
import { spotifyService } from './spotify.service';
import { playbackService } from './playback.service';
import { queueService } from './queue.service';

const PROCESS_INTERVAL_MS = 5000;

export type ClaimedSchedule = Awaited<ReturnType<typeof scheduledPlaybackService.claimDueSchedules>>[number];
class ScheduledPlaybackProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, PROCESS_INTERVAL_MS);

    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const referenceTime = new Date();
      const dueSchedules = await scheduledPlaybackService.claimDueSchedules(referenceTime);

      for (const schedule of dueSchedules) {
        try {
          await this.executeSchedule(schedule);
          await scheduledPlaybackService.recordSuccess(schedule);
        } catch (error: any) {
          const reason = error?.message ?? 'Scheduled playback failed';
          console.error(`Scheduled playback ${schedule.id} failed:`, error);
          await scheduledPlaybackService.recordFailure(schedule, reason);
        }
      }
    } catch (error) {
      console.error('Scheduled playback processor tick failed:', error);
    } finally {
      this.running = false;
    }
  }

  private async executeSchedule(schedule: ClaimedSchedule) {
    const { session, tracks } = schedule;

    if (!session) {
      throw new Error('Schedule missing session context');
    }

    if (!tracks.length) {
      throw new Error('Scheduled playback contains no tracks');
    }

    const hostId = session.hostId;
    const accessToken = await spotifyService.ensureValidToken(hostId);

    for (const track of tracks) {
      let artistSpotifyIds: string[] = [];

      try {
        const trackDetails = await spotifyService.getTrack(track.spotifyTrackId, accessToken);
        artistSpotifyIds = Array.isArray(trackDetails?.artists)
          ? trackDetails.artists.map((artist: any) => artist?.id).filter(Boolean)
          : [];
      } catch (trackDetailsError) {
        console.warn(`Failed to fetch track details for scheduled track ${track.spotifyTrackId}:`, trackDetailsError);
      }

      try {
        await queueService.addToQueue(
          schedule.sessionId,
          track.spotifyTrackId,
          track.trackName,
          track.trackArtist,
          track.trackAlbum ?? null,
          track.trackImage ?? null,
          track.trackDuration,
          artistSpotifyIds,
          { userId: hostId }
        );
      } catch (queueError: any) {
        const message: string | undefined = queueError?.message;
        if (message && (
          message.includes('Track already in queue') ||
          message.includes('Track has been banned') ||
          message.includes('Artist "')
        )) {
          console.warn(`Skipping scheduled track ${track.spotifyTrackId}: ${message}`);
          continue;
        }

        console.warn('Failed to enqueue scheduled track:', queueError);
      }
    }

    playbackService.requestImmediateSync(schedule.sessionId, 1500);
  }
}

export const scheduledPlaybackProcessor = new ScheduledPlaybackProcessor();
