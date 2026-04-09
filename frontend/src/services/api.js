import axios from 'axios';
import { BASE_URL } from '../constants/api';
import { auth } from './firebase';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Search
export const searchMusic = (q) =>
  api.get('/search', { params: { q } }).then(r => r.data);

function toDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value !== 'string') {
    return 0;
  }

  return value
    .split(':')
    .map(part => Number.parseInt(part, 10))
    .filter(part => Number.isFinite(part))
    .reduce((total, part) => total * 60 + part, 0);
}

function toRecentSongPayload(song = {}) {
  return {
    videoId:         song.videoId || '',
    title:           song.title || '',
    artist:          song.artist || '',
    thumbnail:       song.thumbnail || '',
    durationSeconds: song.durationSeconds || toDurationSeconds(song.duration),
    album:           song.album || '',
  };
}

function toRecentHeader(recentSongs = []) {
  const payload = recentSongs
    .slice(0, 10)
    .map(song => ({
      videoId: song?.videoId || '',
      artist: song?.artist || '',
    }))
    .filter(song => song.videoId || song.artist);

  return payload.length ? JSON.stringify(payload) : '';
}

// Stream — ALWAYS fetch fresh, NEVER cache in localStorage
export const getStreamUrl = (videoId) =>
  api.get(`/stream/${videoId}`).then(r => r.data.url);

// Trending
export const getTrending = () =>
  api.get('/trending').then(r => r.data);

// Recommendations
export const getRecommendations = (recentSongs = []) => {
  const recentHeader = toRecentHeader(recentSongs);

  return api.get('/recommendations', {
    headers: recentHeader ? { 'x-recent-songs': recentHeader } : undefined,
  }).then(r => r.data.tracks || []);
};

// Lyrics
export const getLyrics = (title, artist) =>
  api.get('/lyrics', { params: { title, artist } }).then(r => r.data);

// Recently played sync â€” best effort only
export const syncRecentlyPlayed = (song) => {
  if (!auth?.currentUser || !song?.videoId) {
    return Promise.resolve(null);
  }

  return api.post('/recently-played', toRecentSongPayload(song))
    .then(r => r.data)
    .catch(() => null);
};

// Playlists (JWT protected)
export const getPlaylists          = ()                    => api.get('/playlist').then(r => r.data.playlists);
export const createPlaylist        = (name)                => api.post('/playlist', { name }).then(r => r.data);
export const deletePlaylist        = (id)                  => api.delete(`/playlist/${id}`).then(r => r.data);
export const addSongToPlaylist     = (playlistId, song)    => api.post(`/playlist/${playlistId}/song`, song).then(r => r.data);
export const removeSongFromPlaylist= (playlistId, videoId) => api.delete(`/playlist/${playlistId}/song/${videoId}`).then(r => r.data);

// Fetch album track list — called when user taps an album card
export const getAlbumSongs = (browseId) =>
  api.get(`/search/album/${browseId}`).then(r => r.data);

// Fetch artist popular songs — called when user taps an artist card
export const getArtistSongs = (artistId) =>
  api.get(`/search/artist/${artistId}`).then(r => r.data);
