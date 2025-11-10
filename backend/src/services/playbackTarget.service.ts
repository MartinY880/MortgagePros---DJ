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

  async getPreference(userId: string): Promise<PlaybackDevicePreference> {
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

  async listDevices(userId: string, accessToken: string) {
    if (this.usesLibrespot()) {
      return {
        devices: [],
        selectedDeviceId: null,
        librespotEnabled: true,
        librespotDeviceName: config.librespot.deviceName,
      };
    }

    const devices = await spotifyService.getAvailableDevices(accessToken);
    const preference = await this.getPreference(userId);

    if (preference.playbackDeviceId) {
      const match = devices.find((device: any) => device?.id === preference.playbackDeviceId);

      if (match) {
        await userModel.update({
          where: { id: userId },
          data: {
            playbackDeviceName: match.name ?? preference.playbackDeviceName ?? null,
            playbackDeviceType: match.type ?? preference.playbackDeviceType ?? null,
            playbackDeviceLastSeen: new Date(),
          },
        } as any);
      }
    }

    return {
      devices,
      selectedDeviceId: preference.playbackDeviceId,
      librespotEnabled: false,
    };
  }

  async selectDevice(userId: string, accessToken: string, deviceId: string | null) {
    if (this.usesLibrespot()) {
      throw new Error('Managed librespot receiver is enabled. Disable it before selecting a manual device.');
    }

    if (!deviceId) {
      await this.clearPreference(userId);
      return null;
    }

    const devices = await spotifyService.getAvailableDevices(accessToken);
    const match = devices.find((device: any) => device?.id === deviceId);

    if (!match) {
      throw new Error('Selected device is not available. Ensure it is active in Spotify and try again.');
    }

    await userModel.update({
      where: { id: userId },
      data: {
        playbackDeviceId: match.id,
        playbackDeviceName: match.name ?? null,
        playbackDeviceType: match.type ?? null,
        playbackDeviceLastSeen: new Date(),
      },
    } as any);

    // Don't immediately try to transfer playback for web player devices
    // They need time to fully initialize and may not have active playback yet
    const isWebPlayer = match.name?.includes('MTGPros DJ') || match.name?.includes('Web Player');
    
    if (!isWebPlayer) {
      try {
        await spotifyService.transferPlayback(match.id, accessToken, false);
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 403) {
          await this.clearPreference(userId);
          throw new Error('Device became unavailable during transfer. Please choose another device.');
        }

        console.warn('Failed to initiate playback on selected device:', error);
      }
    } else {
      console.log('Web player device selected, skipping immediate transfer (will transfer when queuing tracks)');
    }

    return {
      id: match.id,
      name: match.name,
      type: match.type,
      is_active: match.is_active,
    };
  }

  async queueTrack(userId: string, accessToken: string, trackUri: string, options?: QueueOptions) {
    if (this.usesLibrespot()) {
      await librespotService.queueTrack(userId, accessToken, trackUri, options);
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
}

export const playbackTargetService = new PlaybackTargetService();
export const PLAYBACK_DEVICE_RESYNC_INTERVAL_MS = DEVICE_RESYNC_INTERVAL_MS;
