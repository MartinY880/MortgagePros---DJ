import SpotifyWebApi from 'spotify-web-api-node';
import { config } from '../config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SpotifyService {
  private spotifyApi: any;

  constructor() {
    this.spotifyApi = new SpotifyWebApi({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: config.spotify.redirectUri,
    });
  }

  getAuthUrl(): string {
    const scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'streaming',
      'user-read-email',
      'user-read-private',
      'playlist-read-private',
      'playlist-read-collaborative',
    ];

    return this.spotifyApi.createAuthorizeURL(scopes, 'state', true);
  }

  async handleCallback(code: string) {
    const data = await this.spotifyApi.authorizationCodeGrant(code);
    return {
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      expiresIn: data.body.expires_in,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const api = new SpotifyWebApi({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      refreshToken,
    });

    const data = await api.refreshAccessToken();
    return {
      accessToken: data.body.access_token,
      expiresIn: data.body.expires_in,
    };
  }

  async getCurrentUser(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getMe();
    return data.body;
  }

  async searchTracks(query: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.searchTracks(query, { limit: 20 });
    return data.body.tracks?.items || [];
  }

  async getTrack(trackId: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getTrack(trackId);
    return data.body;
  }

  async addToQueue(trackUri: string, accessToken: string, deviceId?: string | null) {
    this.spotifyApi.setAccessToken(accessToken);
    const options = deviceId ? { device_id: deviceId } : undefined;
    await this.spotifyApi.addToQueue(trackUri, options);
  }

  async getCurrentPlayback(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getMyCurrentPlaybackState();
    return data.body;
  }

  async getAvailableDevices(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getMyDevices();
    return data.body.devices || [];
  }

  async transferPlayback(deviceId: string, accessToken: string, play = false) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.transferMyPlayback({
      deviceIds: [deviceId],
      play,
    });
  }

  async playUris(accessToken: string, uris: string[], deviceId?: string | null, options?: { positionMs?: number }) {
    this.spotifyApi.setAccessToken(accessToken);
    const payload: Record<string, unknown> = {
      uris,
    };

    if (deviceId) {
      payload.device_id = deviceId;
    }

    if (typeof options?.positionMs === 'number') {
      payload.position_ms = options.positionMs;
    }

    await this.spotifyApi.play(payload);
  }

  async play(accessToken: string, deviceId?: string) {
    this.spotifyApi.setAccessToken(accessToken);
    if (deviceId) {
      await this.spotifyApi.play({ device_id: deviceId });
    } else {
      await this.spotifyApi.play();
    }
  }

  async playContext(
    accessToken: string,
    options: {
      deviceId?: string | null;
      contextUri: string;
      offsetUri?: string;
      offsetPosition?: number;
      positionMs?: number;
    }
  ) {
    this.spotifyApi.setAccessToken(accessToken);

    const payload: Record<string, unknown> = {
      context_uri: options.contextUri,
    };

    if (options.deviceId) {
      payload.device_id = options.deviceId;
    }

    if (options.offsetUri) {
      payload.offset = { uri: options.offsetUri };
    } else if (typeof options.offsetPosition === 'number') {
      payload.offset = { position: options.offsetPosition };
    }

    if (typeof options.positionMs === 'number') {
      payload.position_ms = options.positionMs;
    }

    await this.spotifyApi.play(payload);
  }

  async pause(accessToken: string, deviceId?: string) {
    this.spotifyApi.setAccessToken(accessToken);
    if (deviceId) {
      await this.spotifyApi.pause({ device_id: deviceId });
    } else {
      await this.spotifyApi.pause();
    }
  }

  async skipToNext(accessToken: string, deviceId?: string) {
    this.spotifyApi.setAccessToken(accessToken);
    if (deviceId) {
      await this.spotifyApi.skipToNext({ device_id: deviceId });
    } else {
      await this.spotifyApi.skipToNext();
    }
  }

  async getUserPlaylists(accessToken: string, limit = 50) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getUserPlaylists({ limit });
    return data.body.items || [];
  }

  async getPlaylistTracks(playlistId: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getPlaylistTracks(playlistId);
    return data.body.items || [];
  }

  async startPlaylist(playlistUri: string, accessToken: string, deviceId?: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const options: any = { context_uri: playlistUri };
    if (deviceId) {
      options.device_id = deviceId;
    }
    await this.spotifyApi.play(options);
  }

  async ensureValidToken(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if token is expired (with 5 minute buffer)
    const now = new Date();
    const expiryWithBuffer = new Date(user.tokenExpiry.getTime() - 5 * 60 * 1000);

    if (now > expiryWithBuffer) {
      // Refresh token
      const tokens = await this.refreshAccessToken(user.refreshToken);
      const newExpiry = new Date(now.getTime() + tokens.expiresIn * 1000);

      await prisma.user.update({
        where: { id: userId },
        data: {
          accessToken: tokens.accessToken,
          tokenExpiry: newExpiry,
        },
      });

      return tokens.accessToken;
    }

    return user.accessToken;
  }
}

export const spotifyService = new SpotifyService();
