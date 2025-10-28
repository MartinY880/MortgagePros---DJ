import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

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

export default api;
