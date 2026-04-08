import axios from 'axios';
import { BASE_URL } from '../constants/api';
import { auth } from './firebase';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Search
export const searchMusic = (q) =>
  api.get('/search', { params: { q } }).then(r => r.data);

// Stream — ALWAYS fetch fresh, NEVER cache in localStorage
export const getStreamUrl = (videoId) =>
  api.get(`/stream/${videoId}`).then(r => r.data.url);

// Trending
export const getTrending = () =>
  api.get('/trending').then(r => r.data);

// Lyrics
export const getLyrics = (title, artist) =>
  api.get('/lyrics', { params: { title, artist } }).then(r => r.data);

// Playlists (JWT protected)
export const getPlaylists          = ()                    => api.get('/playlist').then(r => r.data.playlists);
export const createPlaylist        = (name)                => api.post('/playlist', { name }).then(r => r.data);
export const deletePlaylist        = (id)                  => api.delete(`/playlist/${id}`).then(r => r.data);
export const addSongToPlaylist     = (playlistId, song)    => api.post(`/playlist/${playlistId}/song`, song).then(r => r.data);
export const removeSongFromPlaylist= (playlistId, videoId) => api.delete(`/playlist/${playlistId}/song/${videoId}`).then(r => r.data);
