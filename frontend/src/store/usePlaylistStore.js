import { create } from 'zustand';
import * as api from '../services/api';

// Local playlist helpers (used when not logged in)
const LOCAL_KEY = 'youfy_local_playlists';
const getLocal  = () => JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
const saveLocal = (p) => localStorage.setItem(LOCAL_KEY, JSON.stringify(p));

const usePlaylistStore = create((set, get) => ({
  playlists: [],
  loading:   false,
  isCloud:   false,   // true when user is logged in

  // Call after login state is known
  init: async (user) => {
    if (user) {
      set({ isCloud: true });
      await get().fetchPlaylists();
    } else {
      set({ isCloud: false, playlists: getLocal() });
    }
  },

  fetchPlaylists: async () => {
    set({ loading: true });
    try {
      const playlists = await api.getPlaylists();
      set({ playlists });
    } catch { /* silently fail */ }
    finally { set({ loading: false }); }
  },

  createPlaylist: async (name) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      const { playlist } = await api.createPlaylist(name);
      set({ playlists: [playlist, ...playlists] });
    } else {
      const newPl = { id: Date.now().toString(), name, songs: [], createdAt: new Date().toISOString() };
      const updated = [newPl, ...playlists];
      saveLocal(updated);
      set({ playlists: updated });
    }
  },

  deletePlaylist: async (id) => {
    const { isCloud, playlists } = get();
    if (isCloud) await api.deletePlaylist(id);
    const updated = playlists.filter(p => p.id !== id);
    if (!isCloud) saveLocal(updated);
    set({ playlists: updated });
  },

  addSong: async (playlistId, song) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      await api.addSongToPlaylist(playlistId, song);
      await get().fetchPlaylists();
    } else {
      const updated = playlists.map(p =>
        p.id === playlistId
          ? { ...p, songs: [...(p.songs || []), song] }
          : p
      );
      saveLocal(updated);
      set({ playlists: updated });
    }
  },

  removeSong: async (playlistId, videoId) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      await api.removeSongFromPlaylist(playlistId, videoId);
      await get().fetchPlaylists();
    } else {
      const updated = playlists.map(p =>
        p.id === playlistId
          ? { ...p, songs: p.songs.filter(s => s.videoId !== videoId) }
          : p
      );
      saveLocal(updated);
      set({ playlists: updated });
    }
  },
}));

export default usePlaylistStore;
