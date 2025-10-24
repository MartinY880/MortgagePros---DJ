export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  images?: { url: string }[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  uri: string;
}

export interface SessionData {
  id: string;
  code: string;
  name: string;
  hostId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface QueueItemData {
  id: string;
  sessionId: string;
  spotifyTrackId: string;
  trackName: string;
  trackArtist: string;
  trackAlbum: string | null;
  trackImage: string | null;
  trackDuration: number;
  addedById: string;
  voteScore: number;
  played: boolean;
  playedAt: Date | null;
  createdAt: Date;
  addedBy?: {
    displayName: string;
  };
  votes?: VoteData[];
}

export interface VoteData {
  id: string;
  queueItemId: string;
  userId: string;
  voteType: number;
}

export interface UserSession {
  userId: string;
  spotifyId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
}
