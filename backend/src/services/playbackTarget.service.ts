import { spotifyService } from './spotify.service';
export type QueueOptions = {
  autoTransfer?: boolean;
};

class PlaybackTargetService {
  isLibrespotEnabled() {
    return false;
  }

  getLibrespotDeviceName() {
    return null;
  }

  isManagedPlaybackEnabled() {
    return false;
  }

  getManagedDeviceName() {
    return null;
  }

  async queueTrack(_userId: string, accessToken: string, trackUri: string, _options?: QueueOptions) {
    await spotifyService.addToQueue(trackUri, accessToken);
  }

  async transferPlayback(_userId: string, _accessToken: string, _play = false): Promise<boolean> {
    return false;
  }

  async reconcilePlaybackDevice(
    _userId: string,
    _accessToken: string,
    _playbackDevice: any | null,
    _lastSyncAt: number
  ): Promise<number> {
    return Date.now();
  }

  async getManagedDeviceId(
    _userId: string,
    _accessToken: string,
    _options?: { forceRefresh?: boolean }
  ): Promise<string | null> {
    return null;
  }
}

export const playbackTargetService = new PlaybackTargetService();
