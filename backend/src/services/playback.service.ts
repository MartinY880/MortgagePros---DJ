import { Server as SocketIOServer } from 'socket.io';
import { queueService } from './queue.service';
import { spotifyService } from './spotify.service';
import { broadcastQueueUpdate, broadcastPlaybackUpdate } from '../sockets/handlers';
import { skipCounterService } from './skipCounter.service';

interface MonitorState {
  hostId: string;
  timeout: NodeJS.Timeout | null;
  processing: boolean;
  lastQueuedItemId: string | null;
  pauseUntil: number | null;
}

const MIN_POLL_DELAY_MS = 3000;
const DEFAULT_IDLE_POLL_MS = 15000;
const POST_TRACK_END_DELAY_MS = 5000;
const POST_SKIP_DELAY_MS = 3000;

class PlaybackService {
  private io: SocketIOServer | null = null;
  private monitors = new Map<string, MonitorState>();

  private async resolveRequester(sessionId: string, spotifyTrackId?: string | null) {
    if (!spotifyTrackId) {
      return null;
    }

    const queueItem = await queueService.getMostRecentQueueItemForTrack(sessionId, spotifyTrackId);

    if (!queueItem) {
      return null;
    }

    if (queueItem.addedBy) {
      return {
        type: 'host' as const,
        name: queueItem.addedBy.displayName,
      };
    }

    if (queueItem.addedByGuest) {
      return {
        type: 'guest' as const,
        name: queueItem.addedByGuest.name,
      };
    }

    return {
      type: 'unknown' as const,
      name: 'Unknown',
    };
  }

  setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  ensureMonitor(sessionId: string, hostId: string) {
    const existing = this.monitors.get(sessionId);

    if (existing) {
      existing.hostId = hostId;
      if (!existing.timeout && !existing.processing) {
        this.schedulePoll(sessionId, 0);
      }
      return;
    }

    this.monitors.set(sessionId, {
      hostId,
      timeout: null,
      processing: false,
      lastQueuedItemId: null,
      pauseUntil: null,
    });

    this.schedulePoll(sessionId, 0);
  }

  stopMonitor(sessionId: string) {
    const monitor = this.monitors.get(sessionId);

    if (monitor) {
      if (monitor.timeout) {
        clearTimeout(monitor.timeout);
      }
      this.monitors.delete(sessionId);
    }
  }

  recordManualQueue(sessionId: string, queueItemId: string) {
    const monitor = this.monitors.get(sessionId);

    if (monitor) {
      monitor.lastQueuedItemId = queueItemId;
    }
  }

  requestImmediateSync(sessionId: string, delayMs = 0) {
    const monitor = this.monitors.get(sessionId);

    if (!monitor) {
      return;
    }

    monitor.pauseUntil = null;

    if (monitor.processing) {
      return;
    }

    this.schedulePoll(sessionId, delayMs);
  }

  private schedulePoll(sessionId: string, delayMs: number) {
    const monitor = this.monitors.get(sessionId);

    if (!monitor) {
      return;
    }

    if (monitor.timeout) {
      clearTimeout(monitor.timeout);
    }

    monitor.timeout = setTimeout(() => {
      monitor.timeout = null;
      this.pollSession(sessionId).catch((error) => {
        console.error(`Playback poll error for session ${sessionId}:`, error);
      });
    }, Math.max(0, delayMs));
  }

  private async pollSession(sessionId: string) {
    const monitor = this.monitors.get(sessionId);

    if (!monitor || monitor.processing) {
      return;
    }

    if (monitor.pauseUntil) {
      if (Date.now() < monitor.pauseUntil) {
        return;
      }
      monitor.pauseUntil = null;
    }

    if (!this.io) {
      return;
    }

    monitor.processing = true;

    try {
      const now = Date.now();

      if (monitor.pauseUntil && now < monitor.pauseUntil) {
        this.schedulePoll(sessionId, monitor.pauseUntil - now);
        return;
      }
      monitor.pauseUntil = null;

      const accessToken = await spotifyService.ensureValidToken(monitor.hostId);
      const playback = await spotifyService.getCurrentPlayback(accessToken);

      let queueState = await queueService.getQueueWithNext(sessionId);
      let nextDelay = DEFAULT_IDLE_POLL_MS;
      const requester = await this.resolveRequester(sessionId, playback?.item?.id);

      if (playback?.item?.id) {
        const currentTrackId: string = playback.item.id;
        const consumed = await queueService.markTrackAsPlayed(sessionId, currentTrackId);

        if (consumed) {
          monitor.lastQueuedItemId = null;
          queueState = await queueService.getQueueWithNext(sessionId);
          nextDelay = POST_TRACK_END_DELAY_MS;
        }

        const skipState = await skipCounterService.syncCurrentTrack(sessionId, currentTrackId);

        broadcastPlaybackUpdate(this.io, sessionId, {
          playback,
          requester,
          skip: skipState,
        });
      } else {
        if (!queueState.nextUp) {
          monitor.lastQueuedItemId = null;
        }

        const skipState = await skipCounterService.syncCurrentTrack(sessionId, null);

        broadcastPlaybackUpdate(this.io, sessionId, {
          playback: playback ?? null,
          requester: null,
          skip: skipState,
        });
        nextDelay = POST_TRACK_END_DELAY_MS;
      }

      if (queueState.nextUp && queueState.nextUp.id !== monitor.lastQueuedItemId) {
        const trackUri = `spotify:track:${queueState.nextUp.spotifyTrackId}`;
        try {
          await spotifyService.addToQueue(trackUri, accessToken);
          monitor.lastQueuedItemId = queueState.nextUp.id;
        } catch (queueError: any) {
          const statusCode = queueError?.statusCode || queueError?.body?.error?.status;
          const reason = queueError?.body?.error?.reason;
          if (statusCode === 429) {
            const retryAfterHeader = queueError?.headers?.['retry-after'] ?? queueError?.body?.retry_after;
            const retrySeconds = Number.parseInt(`${retryAfterHeader ?? ''}`, 10);
            const delaySeconds = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 60;
            const delayMs = delaySeconds * 1000;
            monitor.pauseUntil = Date.now() + delayMs;
            console.warn(`Spotify rate limited queue for session ${sessionId}. Pausing for ${delaySeconds} seconds.`);
            this.schedulePoll(sessionId, delayMs);
            return;
          }

          if (statusCode === 404 && (reason === 'NO_ACTIVE_DEVICE' || reason === 'PLAYER_NOT_PLAYING')) {
            console.warn('Spotify reported no active playback while queueing. Open Spotify on any device and press play so the queue can advance.');
            this.schedulePoll(sessionId, DEFAULT_IDLE_POLL_MS);
            return;
          }

          console.warn('Failed to enqueue next track:', queueError);
        }
      }

      if (!queueState.nextUp) {
        monitor.lastQueuedItemId = null;
      }

      broadcastQueueUpdate(this.io, sessionId, queueState);

      if (playback?.item && playback.is_playing) {
        const progress = playback.progress_ms ?? 0;
        const duration = playback.item.duration_ms ?? 0;

        if (duration > 0) {
          const remaining = Math.max(0, duration - progress);
          nextDelay = Math.max(MIN_POLL_DELAY_MS, remaining + POST_TRACK_END_DELAY_MS);
        }
      }
      this.schedulePoll(sessionId, nextDelay);
    } catch (error: any) {
      if (error?.statusCode === 429) {
        const retryHeader = error.headers?.['retry-after'] ?? error.headers?.['Retry-After'];
        const retrySeconds = Number.parseInt(retryHeader, 10);
        const delaySeconds = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 60;
        monitor.pauseUntil = Date.now() + delaySeconds * 1000;
        console.warn(`Spotify rate limited session ${sessionId}. Pausing playback sync for ${delaySeconds} seconds.`);
        this.schedulePoll(sessionId, delaySeconds * 1000);
      } else {
        console.error(`Playback sync error for session ${sessionId}:`, error);
        this.schedulePoll(sessionId, DEFAULT_IDLE_POLL_MS);
      }
    } finally {
      monitor.processing = false;
    }
  }
}

export const playbackService = new PlaybackService();
export const PLAYBACK_SKIP_POLL_DELAY_MS = POST_SKIP_DELAY_MS;
