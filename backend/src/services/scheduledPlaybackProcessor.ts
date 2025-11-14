import { scheduledPlaybackService } from './scheduledPlayback.service';
import { spotifyService } from './spotify.service';
import { playbackTargetService } from './playbackTarget.service';
import { queueService } from './queue.service';
import { playbackService } from './playback.service';
import { librespotService } from './librespot.service';

const PROCESS_INTERVAL_MS = 5000;

export type ClaimedSchedule = Awaited<ReturnType<typeof scheduledPlaybackService.claimDueSchedules>>[number];
type ScheduleTrack = ClaimedSchedule['tracks'][number];
type QueueItemSnapshot = {
  id: string;
  spotifyTrackId: string;
  trackName: string;
  trackArtist: string;
  trackAlbum: string | null;
  trackImage: string | null;
  trackDuration: number;
  addedById: string | null;
  addedByGuestId: string | null;
  votes: {
    userId: string | null;
    guestId: string | null;
    voteType: number;
  }[];
};

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

    const queueState = await queueService.getQueueWithNext(schedule.sessionId);
    const nextUp = queueState.nextUp ?? null;

    let nextUpSnapshot: QueueItemSnapshot | null = null;
    const queueSnapshots: QueueItemSnapshot[] = [];

    if (nextUp) {
      nextUpSnapshot = {
        id: nextUp.id,
        spotifyTrackId: nextUp.spotifyTrackId,
        trackName: nextUp.trackName,
        trackArtist: nextUp.trackArtist,
        trackAlbum: nextUp.trackAlbum ?? null,
        trackImage: nextUp.trackImage ?? null,
        trackDuration: nextUp.trackDuration,
        addedById: nextUp.addedById ?? null,
        addedByGuestId: nextUp.addedByGuestId ?? null,
        votes: nextUp.votes?.map((vote) => ({
          userId: vote.userId ?? null,
          guestId: vote.guestId ?? null,
          voteType: vote.voteType,
        })) ?? [],
      };

      try {
        await queueService.removeFromQueue(nextUp.id, { userId: hostId });
      } catch (error) {
        console.warn('Failed to temporarily remove next-up before scheduled playback:', error);
        nextUpSnapshot = null;
      }
    }

    if (queueState.queue.length > 0) {
      for (const item of queueState.queue) {
        queueSnapshots.push({
          id: item.id,
          spotifyTrackId: item.spotifyTrackId,
          trackName: item.trackName,
          trackArtist: item.trackArtist,
          trackAlbum: item.trackAlbum ?? null,
          trackImage: item.trackImage ?? null,
          trackDuration: item.trackDuration,
          addedById: item.addedById ?? null,
          addedByGuestId: item.addedByGuestId ?? null,
          votes: item.votes?.map((vote) => ({
            userId: vote.userId ?? null,
            guestId: vote.guestId ?? null,
            voteType: vote.voteType,
          })) ?? [],
        });

        try {
          await queueService.removeFromQueue(item.id, { userId: hostId });
        } catch (error) {
          console.warn('Failed to remove queued track during scheduled playback:', error);
        }
      }
    }

    const currentContextUri = playbackBefore?.context?.uri ?? null;
    const currentItemUri = playbackBefore?.item?.uri ?? null;
    const progressMs = playbackBefore?.progress_ms ?? 0;
    const shouldResetQueue = Boolean(nextUpSnapshot || queueSnapshots.length > 0);

    if (shouldResetQueue && (currentContextUri || currentItemUri)) {
      try {
        if (currentContextUri) {
          await spotifyService.playContext(accessToken, {
            deviceId: deviceId ?? undefined,
            contextUri: currentContextUri,
            offsetUri: currentItemUri ?? undefined,
            positionMs: progressMs,
          });
        } else if (currentItemUri) {
          await spotifyService.playUris(accessToken, [currentItemUri], deviceId ?? undefined, {
            positionMs: progressMs,
          });
        }
      } catch (error) {
        console.warn('Failed to refresh playback context before scheduled playback:', error);
      }
    }

    for (const track of tracks) {
      try {
  await playbackTargetService.queueTrack(hostId, accessToken, track.spotifyUri, { autoTransfer: false });
      } catch (queueError) {
        console.warn('Failed to queue scheduled track:', queueError);
      }
    }

    if (nextUpSnapshot) {
      try {
        const actor = nextUpSnapshot.addedByGuestId
          ? { guestId: nextUpSnapshot.addedByGuestId }
          : nextUpSnapshot.addedById
          ? { userId: nextUpSnapshot.addedById }
          : { userId: hostId };

        const restoredQueueItem = await queueService.addToQueue(
          schedule.sessionId,
          nextUpSnapshot.spotifyTrackId,
          nextUpSnapshot.trackName,
          nextUpSnapshot.trackArtist,
          nextUpSnapshot.trackAlbum,
          nextUpSnapshot.trackImage,
          nextUpSnapshot.trackDuration,
          actor,
        );

        for (const vote of nextUpSnapshot.votes) {
          try {
            if (vote.userId) {
              await queueService.vote(restoredQueueItem.id, { userId: vote.userId }, vote.voteType);
            } else if (vote.guestId) {
              await queueService.vote(restoredQueueItem.id, { guestId: vote.guestId }, vote.voteType);
            }
          } catch (voteError) {
            console.warn('Failed to restore vote on next-up track:', voteError);
          }
        }

        const nextUri = `spotify:track:${nextUpSnapshot.spotifyTrackId}`;
        try {
          await playbackTargetService.queueTrack(hostId, accessToken, nextUri, { autoTransfer: false });
          playbackService.recordManualQueue(schedule.sessionId, restoredQueueItem.id);
        } catch (queueError) {
          console.warn('Failed to queue restored next-up track after scheduled playback:', queueError);
        }
      } catch (error) {
        console.warn('Failed to restore next-up track after scheduled playback:', error);
      }
    }

    if (queueSnapshots.length > 0) {
      for (const snapshot of queueSnapshots) {
        try {
          const actor = snapshot.addedByGuestId
            ? { guestId: snapshot.addedByGuestId }
            : snapshot.addedById
            ? { userId: snapshot.addedById }
            : { userId: hostId };

          const restored = await queueService.addToQueue(
            schedule.sessionId,
            snapshot.spotifyTrackId,
            snapshot.trackName,
            snapshot.trackArtist,
            snapshot.trackAlbum,
            snapshot.trackImage,
            snapshot.trackDuration,
            actor,
          );

          for (const vote of snapshot.votes) {
            try {
              if (vote.userId) {
                await queueService.vote(restored.id, { userId: vote.userId }, vote.voteType);
              } else if (vote.guestId) {
                await queueService.vote(restored.id, { guestId: vote.guestId }, vote.voteType);
              }
            } catch (voteError) {
              console.warn('Failed to restore vote on queued track:', voteError);
            }
          }
        } catch (error) {
          console.warn('Failed to restore queued track after scheduled playback:', error);
        }
      }
    }

    playbackService.requestImmediateSync(schedule.sessionId, 1500);
  }
}

export const scheduledPlaybackProcessor = new ScheduledPlaybackProcessor();
