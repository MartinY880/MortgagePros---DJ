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

  async searchTracks(
    query: string,
    accessToken: string,
    options?: { limit?: number; offset?: number }
  ) {
    this.spotifyApi.setAccessToken(accessToken);
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 50);
    const offset = Math.max(options?.offset ?? 0, 0);
    const data = await this.spotifyApi.searchTracks(query, { limit, offset });
    const tracks = data.body.tracks;

    return {
      items: tracks?.items ?? [],
      limit: tracks?.limit ?? limit,
      offset: tracks?.offset ?? offset,
      total: tracks?.total ?? tracks?.items?.length ?? 0,
    };
  }

  async searchArtists(query: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.searchArtists(query, { limit: 20 });
    return data.body.artists?.items || [];
  }

  async getTrack(trackId: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getTrack(trackId);
    return data.body;
  }

  async addToQueue(trackUri: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.addToQueue(trackUri);
  }

  async getCurrentPlayback(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    try {
      const data = await this.spotifyApi.getMyCurrentPlaybackState();
      return data.body;
    } catch (error: any) {
      // If there's no active playback, Spotify returns 204 No Content
      const statusCode = error?.statusCode || error?.response?.status || error?.status;
      if (statusCode === 204) {
        console.log('No active playback (204 No Content)');
        return null;
      }

      if (statusCode === 429) {
        const retryAfterHeader = error?.headers?.['retry-after']
          ?? error?.response?.headers?.['retry-after']
          ?? error?.body?.retry_after;
        const retryAfterSeconds = Number.parseInt(`${retryAfterHeader ?? ''}`, 10);

        const rateLimitError = new Error('Spotify rate limit');
        (rateLimitError as any).statusCode = 429;
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          (rateLimitError as any).retryAfter = retryAfterSeconds;
        }
        (rateLimitError as any).headers = error?.headers ?? error?.response?.headers ?? {};
        throw rateLimitError;
      }
      
      // Log the error for debugging but return null instead of throwing
      console.error('Failed to get current playback state:', {
        statusCode,
        message: error?.message,
        errorBody: error?.body,
      });
      
      // Return null to indicate no playback data available
      return null;
    }
  }

  async play(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.play();
  }

  async pause(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.pause();
  }

  async skipToNext(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.skipToNext();
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

  async startPlaylist(playlistUri: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.play({ context_uri: playlistUri });
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
