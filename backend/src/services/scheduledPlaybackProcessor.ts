import { scheduledPlaybackService } from './scheduledPlayback.service';
import { spotifyService } from './spotify.service';
import { playbackTargetService } from './playbackTarget.service';
import { playbackService } from './playback.service';
import { librespotService } from './librespot.service';

const PROCESS_INTERVAL_MS = 5000;

export type ClaimedSchedule = Awaited<ReturnType<typeof scheduledPlaybackService.claimDueSchedules>>[number];
type ScheduleTrack = ClaimedSchedule['tracks'][number];
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

    const playbackBefore = await spotifyService.getCurrentPlayback(accessToken).catch(() => null);

    let deviceId: string | null = playbackBefore?.device?.id ?? null;

    if (playbackTargetService.isLibrespotEnabled()) {
      deviceId = await librespotService.ensureDevice(hostId, accessToken);
      if (!deviceId) {
        throw new Error('Librespot device unavailable');
      }
      await librespotService.transferPlayback(hostId, accessToken, false);
    } else if (playbackTargetService.isManagedPlaybackEnabled()) {
      deviceId = await playbackTargetService.getManagedDeviceId(hostId, accessToken, { forceRefresh: true });
      if (!deviceId) {
        throw new Error('Managed playback device unavailable');
      }
      await playbackTargetService.transferPlayback(hostId, accessToken, false);
    } else {
      try {
        const preference = await playbackTargetService.getPreference(hostId);
        if (preference.playbackDeviceId) {
          deviceId = preference.playbackDeviceId;
        }
      } catch (error) {
        console.warn('Failed to resolve playback preference for host; continuing with active device.', error);
      }

      if (!deviceId) {
        deviceId = playbackBefore?.device?.id ?? null;
      }

      if (!deviceId) {
        throw new Error('No active playback device is available for the host');
      }

      await playbackTargetService.transferPlayback(hostId, accessToken, false);
    }

    for (const track of tracks) {
      try {
        await playbackTargetService.queueTrack(hostId, accessToken, track.spotifyUri, { autoTransfer: false });
      } catch (queueError) {
        console.warn('Failed to queue scheduled track:', queueError);
      }
    }

    playbackService.requestImmediateSync(schedule.sessionId, 1500);
  }
}

export const scheduledPlaybackProcessor = new ScheduledPlaybackProcessor();
