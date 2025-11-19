export interface User {
  id: string;
  spotifyId: string;
  displayName: string;
  email?: string;
  createdAt: string;
  playbackDeviceId?: string | null;
  playbackDeviceName?: string | null;
  playbackDeviceType?: string | null;
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
    clerkUserId?: string | null;
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

export interface CreditState {
  totalCredits: number;
  currentCredits: number;
  refreshDate: string;
}

export interface SessionParticipant {
  type: 'host' | 'guest' | 'none';
  name?: string;
  guestId?: string;
  credits?: CreditState;
}

export interface QueueState {
  nextUp: QueueItem | null;
  queue: QueueItem[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  uri: string;
  explicit: boolean;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images?: { url: string }[];
}

export interface BannedTrack {
  id: string;
  listId: string;
  spotifyTrackId: string;
  trackName: string;
  trackArtist: string;
  trackAlbum: string | null;
  trackImage: string | null;
  createdAt: string;
}

export interface BannedArtist {
  id: string;
  listId: string;
  spotifyArtistId: string;
  artistName: string;
  artistImage: string | null;
  createdAt: string;
}

export interface BannedTrackList {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tracks: BannedTrack[];
  artists: BannedArtist[];
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

export interface SpotifyDeviceInfo {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_private_session?: boolean;
  is_restricted?: boolean;
  volume_percent?: number | null;
}

export interface ManagedPlaybackInfo {
  enabled: boolean;
  strategy: 'manual' | 'librespot' | 'static';
  deviceId?: string | null;
  deviceName?: string | null;
}

export interface LeaderboardEntry {
  id: string;
  fullName: string;
  dials: number;
  appOuts: number;
  underwriting: number;
  totalPoints: number;
}

export type ScheduledPlaybackStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ScheduledPlaybackTrack {
  id: string;
  scheduledPlaybackId: string;
  order: number;
  spotifyTrackId: string;
  spotifyUri: string;
  trackName: string;
  trackArtist: string;
  trackAlbum: string | null;
  trackImage: string | null;
  trackDuration: number;
}

export interface ScheduledPlayback {
  id: string;
  sessionId: string;
  createdById: string;
  scheduledFor: string;
  isRecurringDaily: boolean;
  timeOfDayMinutes?: number | null;
  timezoneOffsetMinutes?: number | null;
  status: ScheduledPlaybackStatus;
  completedAt?: string | null;
  failureReason?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: ScheduledPlaybackStatus | null;
  createdAt: string;
  updatedAt: string;
  tracks: ScheduledPlaybackTrack[];
}
