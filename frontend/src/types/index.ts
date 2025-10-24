export interface User {
  id: string;
  spotifyId: string;
  displayName: string;
  email?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  code: string;
  name: string;
  hostId: string;
  isActive: boolean;
  createdAt: string;
  host: {
    id: string;
    displayName: string;
  };
}

export interface QueueItem {
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
  playedAt: string | null;
  createdAt: string;
  addedBy?: {
    displayName: string;
  };
  votes?: Vote[];
}

export interface Vote {
  id: string;
  queueItemId: string;
  userId: string;
  voteType: number;
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

export interface PlaybackState {
  is_playing: boolean;
  item?: SpotifyTrack;
  progress_ms: number;
}
