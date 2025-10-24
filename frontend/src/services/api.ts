import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

export const authApi = {
  getAuthUrl: () => api.get('/auth/login'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const sessionApi = {
  create: (name: string) => api.post('/sessions', { name }),
  getById: (id: string) => api.get(`/sessions/${id}`),
  getByCode: (code: string) => api.get(`/sessions/code/${code}`),
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
  search: (query: string) => api.get(`/spotify/search?q=${encodeURIComponent(query)}`),
  getPlayback: () => api.get('/spotify/playback'),
  play: () => api.post('/spotify/play'),
  pause: () => api.post('/spotify/pause'),
  next: () => api.post('/spotify/next'),
};

export default api;
