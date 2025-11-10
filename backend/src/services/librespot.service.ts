import { config } from '../config';
import { spotifyService } from './spotify.service';

type DeviceCacheEntry = {
  deviceId: string | null;
  expiresAt: number;
};

type QueueOptions = {
  autoTransfer?: boolean;
};

const DEVICE_CACHE_MIN_TTL_MS = 5000;

class LibrespotService {
  private readonly enabled = config.librespot.enabled;
  private readonly deviceName = config.librespot.deviceName;
  private readonly transferOnQueue = config.librespot.transferOnQueue;
  private readonly cacheTtl = Math.max(config.librespot.discoveryTimeoutMs, DEVICE_CACHE_MIN_TTL_MS);
  private readonly normalizedDeviceName = config.librespot.deviceName.trim().toLowerCase();

  private deviceCache = new Map<string, DeviceCacheEntry>();
  private inflightLookups = new Map<string, Promise<string | null>>();

  isEnabled() {
    return this.enabled;
  }

  private getCacheEntry(userId: string) {
    const cached = this.deviceCache.get(userId);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt < Date.now()) {
      this.deviceCache.delete(userId);
      return null;
    }

    return cached;
  }

  private setCacheEntry(userId: string, deviceId: string | null) {
    this.deviceCache.set(userId, {
      deviceId,
      expiresAt: Date.now() + this.cacheTtl,
    });
  }

  private async refreshDeviceId(userId: string, accessToken: string): Promise<string | null> {
    try {
      const devices = await spotifyService.getAvailableDevices(accessToken);
      const match = devices.find((device: any) =>
        typeof device?.name === 'string' && device.name.trim().toLowerCase() === this.normalizedDeviceName
      );

      const deviceId = match?.id ?? null;

      if (!deviceId) {
        console.warn(`Librespot device "${this.deviceName}" not found for user ${userId}. Available devices: ${devices.map((device: any) => device?.name).filter(Boolean).join(', ')}`);
      }

      this.setCacheEntry(userId, deviceId);
      return deviceId;
    } catch (error) {
      console.error('Failed to query Spotify devices for librespot:', error);
      this.deviceCache.delete(userId);
      throw error;
    }
  }

  private async getDeviceId(userId: string, accessToken: string): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    const cached = this.getCacheEntry(userId);
    if (cached) {
      return cached.deviceId;
    }

    const inflight = this.inflightLookups.get(userId);
    if (inflight) {
      return inflight;
    }

    const lookupPromise = this.refreshDeviceId(userId, accessToken)
      .finally(() => {
        this.inflightLookups.delete(userId);
      });

    this.inflightLookups.set(userId, lookupPromise);
    return lookupPromise;
  }

  async ensureDevice(userId: string, accessToken: string): Promise<string | null> {
    return this.getDeviceId(userId, accessToken);
  }

  async transferPlayback(userId: string, accessToken: string, play = false): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    const deviceId = await this.getDeviceId(userId, accessToken);

    if (!deviceId) {
      return false;
    }

    try {
      await spotifyService.transferPlayback(deviceId, accessToken, play);
      return true;
    } catch (error: any) {
      if (error?.statusCode === 404) {
        // Device probably disconnected. Clear cache and swallow.
        this.deviceCache.delete(userId);
        console.warn(`Librespot device ${this.deviceName} unavailable during transfer; will retry on next action.`);
        return false;
      }

      console.error('Failed to transfer playback to librespot device:', error);
      return false;
    }
  }

  async queueTrack(userId: string, accessToken: string, trackUri: string, options?: QueueOptions) {
    if (!this.enabled) {
      await spotifyService.addToQueue(trackUri, accessToken);
      return;
    }

    const deviceId = await this.getDeviceId(userId, accessToken);

    if (!deviceId) {
      await spotifyService.addToQueue(trackUri, accessToken);
      return;
    }

    const shouldTransfer = options?.autoTransfer ?? this.transferOnQueue;

    if (shouldTransfer) {
      await this.transferPlayback(userId, accessToken, false);
    }

    await spotifyService.addToQueue(trackUri, accessToken, deviceId);
  }
}

export const librespotService = new LibrespotService();
