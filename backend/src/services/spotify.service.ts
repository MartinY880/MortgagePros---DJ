import SpotifyWebApi from 'spotify-web-api-node';
import { config } from '../config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SpotifyService {
  private spotifyApi: SpotifyWebApi;

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

  async addToQueue(trackUri: string, accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    await this.spotifyApi.addToQueue(trackUri);
  }

  async getCurrentPlayback(accessToken: string) {
    this.spotifyApi.setAccessToken(accessToken);
    const data = await this.spotifyApi.getMyCurrentPlaybackState();
    return data.body;
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
