import axios from 'axios';
import { getLogtoAccessToken } from './logtoTokenStore';

let apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
let socketBaseUrl = import.meta.env.VITE_SOCKET_URL || null;

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

const deriveSocketUrl = () => {
  if (socketBaseUrl) {
    return socketBaseUrl;
  }

  if (apiBaseUrl.endsWith('/api')) {
    return apiBaseUrl.slice(0, -4);
  }

  return apiBaseUrl;
};

export function configureFrontendApi(config: { apiBaseUrl?: string; socketUrl?: string }) {
  if (config.apiBaseUrl) {
    apiBaseUrl = config.apiBaseUrl;
    api.defaults.baseURL = apiBaseUrl;
  }

  if (config.socketUrl) {
    socketBaseUrl = config.socketUrl;
  }
}

export function getSocketUrl() {
  return deriveSocketUrl();
}

api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    let token: string | null = null;

    try {
      token = await getLogtoAccessToken();
    } catch (error) {
      console.warn('Failed to retrieve Logto token:', error);
    }

    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

/**
 * Response interceptor – circuit-breaker for auth errors.
 * After seeing consecutive 401s we back off so an expired-token
 * situation doesn't generate a request storm.
 */
let consecutive401s = 0;
let circuitBreakerTrippedAt = 0;
const MAX_CONSECUTIVE_401 = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000; // auto-reset after 30 s

api.interceptors.response.use(
  (response) => {
    // Successful response → reset the 401 counter
    consecutive401s = 0;
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      consecutive401s++;
      if (consecutive401s >= MAX_CONSECUTIVE_401) {
        circuitBreakerTrippedAt = Date.now();
        console.warn(
          `Auth circuit-breaker: ${consecutive401s} consecutive 401s – suppressing further requests for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`,
        );
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Request interceptor – honour the circuit-breaker.
 * When the 401 circuit-breaker has tripped we reject the request
 * immediately (without hitting the network) to prevent request storms.
 * The breaker auto-resets after the cooldown period.
 */
api.interceptors.request.use((config) => {
  if (consecutive401s >= MAX_CONSECUTIVE_401) {
    // Auto-reset after cooldown
    if (Date.now() - circuitBreakerTrippedAt > CIRCUIT_BREAKER_COOLDOWN_MS) {
      consecutive401s = 0;
      return config;
    }
    // Let /auth/ requests through so the user can re-authenticate
    const url = config.url ?? '';
    if (!url.startsWith('/auth')) {
      return Promise.reject(new Error('Auth circuit-breaker: too many consecutive 401s'));
    }
  }
  return config;
});

export const authApi = {
  getAuthUrl: () => api.get('/auth/login'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const sessionApi = {
  create: (payload: { name: string; allowExplicit?: boolean; maxSongDuration?: number }) => api.post('/sessions', payload),
  getById: (id: string) => api.get(`/sessions/${id}`),
  getByCode: (code: string) => api.get(`/sessions/code/${code}`),
  getParticipant: (id: string) => api.get(`/sessions/${id}/participant`),
  getRecent: () => api.get('/sessions/recent'),
  reopen: (id: string) => api.post(`/sessions/${id}/reopen`),
  delete: (id: string) => api.delete(`/sessions/${id}`),
  updateSettings: (id: string, payload: { allowExplicit?: boolean; maxSongDuration?: number }) => 
    api.post(`/sessions/${id}/settings`, payload),
  adjustGuestCredits: (id: string, payload: {
    userId: string;
    amount?: number;
    increaseTotal?: boolean;
    newTotal?: number;
    refill?: boolean;
  }) => api.post(`/sessions/${id}/guest-credits`, payload),
};

export const queueApi = {
  add: (sessionId: string, spotifyTrackId: string) =>
    api.post(`/queue/${sessionId}/add`, { spotifyTrackId }),
  get: (sessionId: string) => api.get(`/queue/${sessionId}`),
  remove: (queueItemId: string) => api.delete(`/queue/${queueItemId}`),
  vote: (queueItemId: string, voteType: number) =>
    api.post(`/queue/${queueItemId}/vote`, { voteType }),
};

export const spotifyApi = {
  search: (
    sessionId: string,
    query: string,
    options?: { hideRestricted?: boolean; offset?: number; limit?: number }
  ) => {
    const params = new URLSearchParams({
      q: query,
      sessionId,
    });

    if (options?.hideRestricted) {
      params.append('hideRestricted', 'true');
    }

    if (typeof options?.offset === 'number' && Number.isFinite(options.offset)) {
      params.append('offset', String(Math.max(0, Math.floor(options.offset))));
    }

    if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
      params.append('limit', String(Math.min(Math.max(Math.floor(options.limit), 1), 50)));
    }

    return api.get(`/spotify/search?${params.toString()}`);
  },
  searchArtists: (sessionId: string, query: string) =>
    api.get(`/spotify/search-artists?q=${encodeURIComponent(query)}&sessionId=${sessionId}`),
  getPlayback: (sessionId: string) => api.get(`/spotify/playback?sessionId=${sessionId}`),
  play: () => api.post('/spotify/play'),
  pause: () => api.post('/spotify/pause'),
  next: (sessionId: string) => api.post('/spotify/next', { sessionId }),
};

export const bannedTracksApi = {
  list: (sessionId: string) => api.get(`/sessions/${sessionId}/banned-track-lists`),
  createList: (sessionId: string, payload: { name: string }) =>
    api.post(`/sessions/${sessionId}/banned-track-lists`, payload),
  addTrack: (
    sessionId: string,
    listId: string,
    track: {
      spotifyTrackId: string;
      trackName: string;
      trackArtist: string;
      trackAlbum?: string | null;
      trackImage?: string | null;
    }
  ) => api.post(`/sessions/${sessionId}/banned-track-lists/${listId}/tracks`, { track }),
  removeTrack: (sessionId: string, listId: string, trackId: string) =>
    api.delete(`/sessions/${sessionId}/banned-track-lists/${listId}/tracks/${trackId}`),
  addArtist: (
    sessionId: string,
    listId: string,
    artist: {
      spotifyArtistId: string;
      artistName: string;
      artistImage?: string | null;
    }
  ) => api.post(`/sessions/${sessionId}/banned-track-lists/${listId}/artists`, { artist }),
  removeArtist: (sessionId: string, listId: string, artistId: string) =>
    api.delete(`/sessions/${sessionId}/banned-track-lists/${listId}/artists/${artistId}`),
};

export const guestApi = {
  joinByCode: (code: string, displayName?: string) =>
    api.post(`/sessions/code/${code}/join`, { displayName }),
  joinById: (sessionId: string, displayName?: string) =>
    api.post(`/sessions/${sessionId}/join`, { displayName }),
};

export const leaderboardApi = {
  getLeaderboard: (sessionId?: string) =>
    api.get(sessionId ? `/sessions/${sessionId}/leaderboard` : '/stats/leaderboard'),
};

export const scheduledPlaybackApi = {
  list: (sessionId: string) => api.get(`/sessions/${sessionId}/scheduled-playback`),
  create: (
    sessionId: string,
    payload: {
      timeOfDay: string;
      timezoneOffsetMinutes: number;
      tracks: Array<{
        spotifyTrackId: string;
        spotifyUri?: string;
        trackName: string;
        trackArtist: string;
        trackAlbum?: string | null;
        trackImage?: string | null;
        trackDuration: number;
      }>;
    }
  ) => api.post(`/sessions/${sessionId}/scheduled-playback`, payload),
  cancel: (sessionId: string, scheduleId: string) =>
    api.delete(`/sessions/${sessionId}/scheduled-playback/${scheduleId}`),
};

export default api;
