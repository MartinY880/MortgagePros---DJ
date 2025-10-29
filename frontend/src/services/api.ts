import axios from 'axios';

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

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options?: { template?: string }) => Promise<string | null>;
      };
    };
  }
}

api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    try {
      const token = await window.Clerk?.session?.getToken();
      if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('Failed to retrieve Clerk token:', error);
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
  create: (payload: { name: string; allowExplicit?: boolean }) => api.post('/sessions', payload),
  getById: (id: string) => api.get(`/sessions/${id}`),
  getByCode: (code: string) => api.get(`/sessions/code/${code}`),
  getParticipant: (id: string) => api.get(`/sessions/${id}/participant`),
  getRecent: () => api.get('/sessions/recent'),
  reopen: (id: string) => api.post(`/sessions/${id}/reopen`),
  delete: (id: string) => api.delete(`/sessions/${id}`),
  adjustGuestCredits: (id: string, payload: {
    clerkUserId: string;
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
  search: (sessionId: string, query: string) =>
    api.get(`/spotify/search?q=${encodeURIComponent(query)}&sessionId=${sessionId}`),
  getPlayback: (sessionId: string) => api.get(`/spotify/playback?sessionId=${sessionId}`),
  play: () => api.post('/spotify/play'),
  pause: () => api.post('/spotify/pause'),
  next: (sessionId: string) => api.post('/spotify/next', { sessionId }),
};

export const guestApi = {
  joinByCode: (code: string) =>
    api.post(`/sessions/code/${code}/join`),
  joinById: (sessionId: string) =>
    api.post(`/sessions/${sessionId}/join`),
};

export const leaderboardApi = {
  getLeaderboard: (sessionId?: string) =>
    api.get(sessionId ? `/sessions/${sessionId}/leaderboard` : '/stats/leaderboard'),
};

export default api;
