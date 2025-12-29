import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { librespotService } from './librespot.service';
import { spotifyService } from './spotify.service';

const prisma = new PrismaClient();
const userModel = (prisma as any).user;

export type PlaybackDevicePreference = {
  playbackDeviceId: string | null;
  playbackDeviceName: string | null;
  playbackDeviceType: string | null;
};

export type QueueOptions = {
  autoTransfer?: boolean;
};

const DEVICE_RESYNC_INTERVAL_MS = 15000;
const MANAGED_DEVICE_RESYNC_INTERVAL_MS = Math.max(5000, config.playback.managedDeviceResyncIntervalMs);

type ManagedDeviceCacheEntry = {
  deviceId: string | null;
  lastChecked: number;
};

class PlaybackTargetService {
  private usesLibrespot() {
    return config.librespot.enabled;
  }

  isLibrespotEnabled() {
    return config.librespot.enabled;
  }

  getLibrespotDeviceName() {
    return config.librespot.deviceName;
  }

  private usesManagedDevice() {
    return Boolean(config.playback.managedDeviceId);
  }

  isManagedPlaybackEnabled() {
    return this.usesLibrespot() || this.usesManagedDevice();
  }

  getManagedDeviceName() {
    return config.playback.managedDeviceName || 'Managed Spotify Device';
  }

  private managedDeviceCache = new Map<string, ManagedDeviceCacheEntry>();

  async getPreference(userId: string): Promise<PlaybackDevicePreference> {
    if (this.usesManagedDevice()) {
      return {
        playbackDeviceId: config.playback.managedDeviceId,
        playbackDeviceName: this.getManagedDeviceName(),
        playbackDeviceType: 'Managed',
      };
    }

    const user = await userModel.findUnique({
      where: { id: userId },
      select: {
        playbackDeviceId: true,
        playbackDeviceName: true,
        playbackDeviceType: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      playbackDeviceId: user.playbackDeviceId ?? null,
      playbackDeviceName: user.playbackDeviceName ?? null,
      playbackDeviceType: user.playbackDeviceType ?? null,
    };
  }

  private async clearPreference(userId: string) {
    if (this.usesManagedDevice()) {
      return;
    }

    await userModel.update({
      where: { id: userId },
      data: {
        playbackDeviceId: null,
        playbackDeviceName: null,
        playbackDeviceType: null,
        playbackDeviceLastSeen: null,
      },
    } as any);
  }

  async queueTrack(userId: string, accessToken: string, trackUri: string, options?: QueueOptions) {
    if (this.usesLibrespot()) {
      await librespotService.queueTrack(userId, accessToken, trackUri, options);
      return;
    }

    if (this.usesManagedDevice()) {
      const managedDeviceId = await this.resolveManagedDeviceId(userId, accessToken).catch(() => null);

      try {
        await spotifyService.addToQueue(trackUri, accessToken, managedDeviceId ?? undefined);
      } catch (error: any) {
        const statusCode = error?.statusCode || error?.body?.error?.status;

        if (managedDeviceId && (statusCode === 404 || statusCode === 403)) {
          console.warn('Managed playback device unavailable while queueing; will refresh device cache.');
          this.managedDeviceCache.delete(userId);
        }

        throw error;
      }

      if (options?.autoTransfer && managedDeviceId) {
        await this.tryTransferToManagedDevice(userId, accessToken, managedDeviceId);
      }

      return;
    }

    const preference = await this.getPreference(userId);
    const deviceId = preference.playbackDeviceId ?? undefined;

    try {
      await spotifyService.addToQueue(trackUri, accessToken, deviceId);
    } catch (error: any) {
      if (deviceId && (error?.statusCode === 404 || error?.statusCode === 403)) {
        console.warn('Preferred playback device unavailable while queueing. Clearing preference.');
        await this.clearPreference(userId);
      }
      throw error;
    }

    if (options?.autoTransfer && deviceId) {
      try {
        await spotifyService.transferPlayback(deviceId, accessToken, false);
      } catch (error: any) {
        const statusCode = error?.statusCode || error?.body?.error?.status;
        
        if (statusCode === 404 || statusCode === 403) {
          console.warn('Preferred playback device unavailable during transfer. Clearing preference.');
          await this.clearPreference(userId);
        } else if (statusCode === 400) {
          console.warn('Transfer failed with 400 error. Device may not be ready yet.');
        } else {
          console.warn('Failed to transfer playback to preferred device:', error);
        }
      }
    }
  }

  async transferPlayback(userId: string, accessToken: string, play = false): Promise<boolean> {
    if (this.usesLibrespot()) {
      return librespotService.transferPlayback(userId, accessToken, play);
    }

    if (this.usesManagedDevice()) {
      const managedDeviceId = await this.resolveManagedDeviceId(userId, accessToken).catch(() => null);

      if (!managedDeviceId) {
        console.warn('Managed playback device unavailable during transfer.');
        return false;
      }

      return this.tryTransferToManagedDevice(userId, accessToken, managedDeviceId, play);
    }

    const preference = await this.getPreference(userId);

    if (!preference.playbackDeviceId) {
      return false;
    }

    try {
      await spotifyService.transferPlayback(preference.playbackDeviceId, accessToken, play);
      await userModel.update({
        where: { id: userId },
        data: {
          playbackDeviceLastSeen: new Date(),
        },
      } as any);
      return true;
    } catch (error: any) {
      // Handle various error cases
      const statusCode = error?.statusCode || error?.body?.error?.status;
      
      if (statusCode === 404 || statusCode === 403) {
        console.warn('Preferred playback device unavailable during transfer. Clearing preference.');
        await this.clearPreference(userId);
        return false;
      }
      
      if (statusCode === 400) {
        // Web player devices may not be ready for transfer yet
        console.warn('Playback transfer failed (device may not be ready). Will retry on next action.');
        return false;
      }

      // For other errors, log but don't throw
      console.error('Unexpected error during playback transfer:', error);
      return false;
    }
  }

  async reconcilePlaybackDevice(
    userId: string,
    accessToken: string,
    playbackDevice: any | null,
    lastSyncAt: number
  ): Promise<number> {
    const now = Date.now();

    if (this.usesLibrespot()) {
      if (now - lastSyncAt < config.librespot.discoveryTimeoutMs) {
        return lastSyncAt;
      }

      await librespotService.ensureDevice(userId, accessToken).catch((error) => {
        console.warn('Failed to refresh librespot device state:', error);
      });

      const playbackDeviceName = playbackDevice?.name?.trim().toLowerCase();
      const expectedDeviceName = config.librespot.deviceName.trim().toLowerCase();

      if (!playbackDevice || playbackDeviceName !== expectedDeviceName) {
        const transferred = await librespotService.transferPlayback(userId, accessToken, false);
        if (!transferred) {
          console.warn('Managed librespot device inactive. Playback transfer will retry automatically.');
        }
      }

      return now;
    }

    if (this.usesManagedDevice()) {
      if (now - lastSyncAt < MANAGED_DEVICE_RESYNC_INTERVAL_MS) {
        return lastSyncAt;
      }

      let managedDeviceId: string | null = null;

      try {
        managedDeviceId = await this.resolveManagedDeviceId(userId, accessToken, true);
      } catch (error) {
        console.warn('Failed to refresh managed playback device state:', error);
        return now;
      }

      if (!managedDeviceId) {
        console.warn('Managed playback device not found during reconciliation. Waiting for device to appear.');
        return now;
      }

      if (playbackDevice?.id === managedDeviceId) {
        return now;
      }

      try {
        await spotifyService.transferPlayback(managedDeviceId, accessToken, false);
      } catch (error: any) {
        const statusCode = error?.statusCode || error?.body?.error?.status;

        if (statusCode === 404 || statusCode === 403) {
          console.warn('Managed playback device unavailable during reconciliation. Clearing cache and retrying later.');
          this.managedDeviceCache.delete(userId);
        } else if (statusCode === 400) {
          console.warn('Managed playback reconciliation skipped (device not ready).');
        } else {
          console.warn('Failed to reconcile managed playback device:', error?.message || error);
        }
      }

      return now;
    }

    if (now - lastSyncAt < DEVICE_RESYNC_INTERVAL_MS) {
      return lastSyncAt;
    }

    const preference = await this.getPreference(userId);

    if (!preference.playbackDeviceId) {
      return now;
    }

    if (playbackDevice?.id === preference.playbackDeviceId) {
      await userModel.update({
        where: { id: userId },
        data: {
          playbackDeviceName: playbackDevice?.name ?? preference.playbackDeviceName ?? null,
          playbackDeviceType: playbackDevice?.type ?? preference.playbackDeviceType ?? null,
          playbackDeviceLastSeen: new Date(),
        },
      } as any);
      return now;
    }

    try {
      await spotifyService.transferPlayback(preference.playbackDeviceId, accessToken, false);
      await userModel.update({
        where: { id: userId },
        data: {
          playbackDeviceLastSeen: new Date(),
        },
      } as any);
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.body?.error?.status;
      
      if (statusCode === 404 || statusCode === 403) {
        console.warn('Preferred playback device unavailable during reconciliation. Clearing preference.');
        await this.clearPreference(userId);
      } else if (statusCode === 400) {
        // Web player or device not ready for transfer - ignore this error
        console.warn('Playback reconciliation skipped (device not ready for transfer).');
      } else {
        console.warn('Failed to reconcile preferred playback device:', error?.message || error);
      }
    }

    return now;
  }

  private async resolveManagedDeviceId(userId: string, accessToken: string, forceRefresh = false): Promise<string | null> {
    if (!this.usesManagedDevice()) {
      return null;
    }

    const now = Date.now();
    const cached = this.managedDeviceCache.get(userId);

    if (!forceRefresh && cached && now - cached.lastChecked < MANAGED_DEVICE_RESYNC_INTERVAL_MS) {
      return cached.deviceId;
    }

    const configuredId = config.playback.managedDeviceId;
    const configuredName = config.playback.managedDeviceName?.trim().toLowerCase();

    try {
      const devices = await spotifyService.getAvailableDevices(accessToken);

      let match = devices.find((device: any) => configuredId && device?.id === configuredId);

      if (!match && configuredName) {
        match = devices.find((device: any) => typeof device?.name === 'string' && device.name.trim().toLowerCase() === configuredName);
      }

      const resolvedId = match?.id ?? null;

      if (!resolvedId) {
        console.warn(
          `Managed playback device not found. Expected id "${configuredId}" or name "${config.playback.managedDeviceName ?? ''}".`
        );
      }

      this.managedDeviceCache.set(userId, { deviceId: resolvedId, lastChecked: now });
      return resolvedId;
    } catch (error) {
      console.error('Failed to query Spotify devices for managed playback device:', error);
      this.managedDeviceCache.delete(userId);
      throw error;
    }
  }

  async getManagedDeviceId(
    userId: string,
    accessToken: string,
    options?: { forceRefresh?: boolean }
  ): Promise<string | null> {
    return this.resolveManagedDeviceId(userId, accessToken, options?.forceRefresh ?? false);
  }

  private async tryTransferToManagedDevice(
    userId: string,
    accessToken: string,
    deviceId: string,
    play = false
  ): Promise<boolean> {
    try {
      await spotifyService.transferPlayback(deviceId, accessToken, play);
      return true;
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.body?.error?.status;

      if (statusCode === 404 || statusCode === 403) {
        console.warn('Managed playback device unavailable during transfer; clearing cache.');
        this.managedDeviceCache.delete(userId);
        return false;
      }

      if (statusCode === 400) {
        console.warn('Managed playback device not ready for transfer; will retry later.');
        return false;
      }

      console.warn('Unexpected error transferring to managed playback device:', error);
      return false;
    }
  }
}

export const playbackTargetService = new PlaybackTargetService();
export const PLAYBACK_DEVICE_RESYNC_INTERVAL_MS = DEVICE_RESYNC_INTERVAL_MS;
