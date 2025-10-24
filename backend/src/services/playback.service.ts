import { Server as SocketIOServer } from 'socket.io';
import { queueService } from './queue.service';
import { spotifyService } from './spotify.service';
import { broadcastQueueUpdate, broadcastPlaybackUpdate } from '../sockets/handlers';

interface MonitorState {
  hostId: string;
  interval: NodeJS.Timeout;
  processing: boolean;
  lastQueuedItemId: string | null;
}

const POLL_INTERVAL_MS = 5000;

class PlaybackService {
  private io: SocketIOServer | null = null;
  private monitors = new Map<string, MonitorState>();

  setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  ensureMonitor(sessionId: string, hostId: string) {
    const existing = this.monitors.get(sessionId);

    if (existing) {
      existing.hostId = hostId;
      return;
    }

    const interval = setInterval(() => {
      this.pollSession(sessionId).catch((error) => {
        console.error(`Playback poll error for session ${sessionId}:`, error);
      });
    }, POLL_INTERVAL_MS);

    this.monitors.set(sessionId, {
      hostId,
      interval,
      processing: false,
      lastQueuedItemId: null,
    });
  }

  stopMonitor(sessionId: string) {
    const monitor = this.monitors.get(sessionId);

    if (monitor) {
      clearInterval(monitor.interval);
      this.monitors.delete(sessionId);
    }
  }

  recordManualQueue(sessionId: string, queueItemId: string) {
    const monitor = this.monitors.get(sessionId);

    if (monitor) {
      monitor.lastQueuedItemId = queueItemId;
    }
  }

  private async pollSession(sessionId: string) {
    const monitor = this.monitors.get(sessionId);

    if (!monitor || monitor.processing) {
      return;
    }

    if (!this.io) {
      return;
    }

    monitor.processing = true;

    try {
      const accessToken = await spotifyService.ensureValidToken(monitor.hostId);
      const playback = await spotifyService.getCurrentPlayback(accessToken);

      let queueState = await queueService.getQueueWithNext(sessionId);

      if (playback?.item?.id) {
        const currentTrackId: string = playback.item.id;
        const consumed = await queueService.markTrackAsPlayed(sessionId, currentTrackId);

        if (consumed) {
          monitor.lastQueuedItemId = null;
          queueState = await queueService.getQueueWithNext(sessionId);
        }
        broadcastPlaybackUpdate(this.io, sessionId, playback);
      } else {
        if (!queueState.nextUp) {
          monitor.lastQueuedItemId = null;
        }
        broadcastPlaybackUpdate(this.io, sessionId, playback ?? null);
      }

      if (queueState.nextUp && queueState.nextUp.id !== monitor.lastQueuedItemId) {
        const trackUri = `spotify:track:${queueState.nextUp.spotifyTrackId}`;
        try {
          await spotifyService.addToQueue(trackUri, accessToken);
          monitor.lastQueuedItemId = queueState.nextUp.id;
        } catch (queueError) {
          console.warn('Failed to enqueue next track:', queueError);
        }
      }

      if (!queueState.nextUp) {
        monitor.lastQueuedItemId = null;
      }

      broadcastQueueUpdate(this.io, sessionId, queueState);
    } catch (error) {
      console.error(`Playback sync error for session ${sessionId}:`, error);
    } finally {
      monitor.processing = false;
    }
  }
}

export const playbackService = new PlaybackService();
