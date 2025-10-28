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
  allowExplicit: boolean;
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
  addedById?: string | null;
  addedByGuestId?: string | null;
  voteScore: number;
  isNextUp: boolean;
  played: boolean;
  playedAt: string | null;
  createdAt: string;
  addedBy?: {
    displayName: string;
  };
  addedByGuest?: {
    id: string;
    name: string;
  };
  votes?: Vote[];
}

export interface Vote {
  id: string;
  queueItemId: string;
  userId?: string;
  guestId?: string;
  voteType: number;
}

export interface SessionParticipant {
  type: 'host' | 'guest' | 'none';
  name?: string;
  guestId?: string;
}

export interface QueueState {
  nextUp: QueueItem | null;
  queue: QueueItem[];
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
  explicit: boolean;
}

export interface PlaybackState {
  is_playing: boolean;
  item?: SpotifyTrack;
  progress_ms: number;
}

export interface PlaybackRequester {
  type: 'host' | 'guest' | 'unknown';
  name: string;
}

export interface LeaderboardEntry {
  id: string;
  fullName: string;
  dials: number;
  appOuts: number;
  underwriting: number;
  totalPoints: number;
}
