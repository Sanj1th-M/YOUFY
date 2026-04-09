import { create } from 'zustand';
import * as api from '../services/api';

// Local playlist helpers (used when not logged in)
const LOCAL_KEY = 'youfy_local_playlists';
const getLocal  = () => JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
const saveLocal = (p) => localStorage.setItem(LOCAL_KEY, JSON.stringify(p));

const LIKED_SYSTEM_KEY = 'liked';
const LIKED_PLAYLIST_NAME = 'Liked Songs';

const localPlaylist = (name) => ({
  id: Date.now().toString(),
  name,
  songs: [],
  createdAt: new Date().toISOString(),
});

const localSystemPlaylist = (systemKey, name) => ({
  id: `system:${systemKey}`,
  systemKey,
  name,
  songs: [],
  createdAt: new Date().toISOString(),
});

function ensureLocalLiked(playlists = []) {
  const hasLiked = playlists.some(p => p?.systemKey === LIKED_SYSTEM_KEY);
  if (hasLiked) return playlists;
  return [localSystemPlaylist(LIKED_SYSTEM_KEY, LIKED_PLAYLIST_NAME), ...playlists];
}

function getLikedPlaylist(playlists = []) {
  return playlists.find(p => p?.systemKey === LIKED_SYSTEM_KEY)
    || playlists.find(p => String(p?.name || '').toLowerCase() === LIKED_PLAYLIST_NAME.toLowerCase())
    || null;
}

function toFallbackMessage(error) {
  const baseMessage =
    error?.response?.data?.error ||
    error?.message ||
    'Cloud playlist sync is unavailable right now.';

  return `${baseMessage} Saving playlists locally on this device.`;
}

const usePlaylistStore = create((set, get) => ({
  playlists: [],
  loading:   false,
  isCloud:   false,   // true when user is logged in
  cloudError: null,

  likedPlaylistId: null,

  isSongLiked: (videoId) => {
    if (!videoId) return false;
    const liked = getLikedPlaylist(get().playlists);
    return Boolean(liked?.songs?.some(s => s?.videoId === videoId));
  },

  toggleLike: async (song) => {
    if (!song?.videoId) return;

    const { playlists, isCloud } = get();
    const liked = getLikedPlaylist(playlists);

    // If liked playlist is missing (local mode), create it now.
    if (!liked && !isCloud) {
      const updated = ensureLocalLiked(playlists);
      saveLocal(updated);
      set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    }

    const current = getLikedPlaylist(get().playlists);
    if (!current) return;

    const exists = current.songs?.some(s => s?.videoId === song.videoId);
    if (exists) {
      await get().removeSong(current.id, song.videoId);
    } else {
      await get().addSong(current.id, song);
    }
  },

  // Call after login state is known
  init: async (user) => {
    if (user) {
      set({ loading: true });

      try {
        const playlists = await api.getPlaylists();
        const liked = getLikedPlaylist(playlists);
        set({ isCloud: true, playlists, cloudError: null, likedPlaylistId: liked?.id || null });
      } catch (error) {
        const localPlaylists = ensureLocalLiked(getLocal());
        saveLocal(localPlaylists);
        set({
          isCloud: false,
          playlists: localPlaylists,
          cloudError: toFallbackMessage(error),
          likedPlaylistId: getLikedPlaylist(localPlaylists)?.id || null,
        });
      } finally {
        set({ loading: false });
      }
    } else {
      const localPlaylists = ensureLocalLiked(getLocal());
      saveLocal(localPlaylists);
      set({
        isCloud: false,
        playlists: localPlaylists,
        cloudError: null,
        likedPlaylistId: getLikedPlaylist(localPlaylists)?.id || null,
      });
    }
  },

  fetchPlaylists: async () => {
    set({ loading: true });
    try {
      const playlists = await api.getPlaylists();
      const liked = getLikedPlaylist(playlists);
      set({ playlists, isCloud: true, cloudError: null, likedPlaylistId: liked?.id || null });
    } catch (error) {
      const localPlaylists = ensureLocalLiked(getLocal());
      saveLocal(localPlaylists);
      set({
        playlists: localPlaylists,
        isCloud: false,
        cloudError: toFallbackMessage(error),
        likedPlaylistId: getLikedPlaylist(localPlaylists)?.id || null,
      });
    }
    finally { set({ loading: false }); }
  },

  createPlaylist: async (name) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      try {
        const { playlist } = await api.createPlaylist(name);
        set({ playlists: [playlist, ...playlists], cloudError: null });
        return;
      } catch (error) {
        saveLocal(playlists);
        set({
          isCloud: false,
          playlists,
          cloudError: toFallbackMessage(error),
        });
      }
    } else {
      set({ cloudError: null });
    }

    const updated = [localPlaylist(name), ...get().playlists];
    saveLocal(updated);
    set({ playlists: updated });
  },

  deletePlaylist: async (id) => {
    const { isCloud, playlists } = get();
    // Never delete system playlists locally (backend blocks too).
    const pl = playlists.find(p => p.id === id);
    if (pl?.systemKey) {
      return;
    }
    if (isCloud) {
      try {
        await api.deletePlaylist(id);
      } catch (error) {
        saveLocal(ensureLocalLiked(playlists));
        set({
          isCloud: false,
          playlists,
          cloudError: toFallbackMessage(error),
        });
      }
    }

    const updated = get().playlists.filter(p => p.id !== id);
    const ensured = ensureLocalLiked(updated);
    saveLocal(ensured);
    set({ playlists: ensured, likedPlaylistId: getLikedPlaylist(ensured)?.id || null });
  },

  addSong: async (playlistId, song) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      try {
        await api.addSongToPlaylist(playlistId, song);
        await get().fetchPlaylists();
        return;
      } catch (error) {
        saveLocal(ensureLocalLiked(playlists));
        set({
          isCloud: false,
          playlists,
          cloudError: toFallbackMessage(error),
        });
      }
    }

    const updated = get().playlists.map(p => {
      if (p.id !== playlistId) return p;
      const songs = Array.isArray(p.songs) ? p.songs : [];
      if (songs.some(s => s?.videoId === song?.videoId)) return p;
      return { ...p, songs: [...songs, song] };
    });
    const ensured = ensureLocalLiked(updated);
    saveLocal(ensured);
    set({ playlists: ensured, likedPlaylistId: getLikedPlaylist(ensured)?.id || null });
  },

  removeSong: async (playlistId, videoId) => {
    const { isCloud, playlists } = get();
    if (isCloud) {
      try {
        await api.removeSongFromPlaylist(playlistId, videoId);
        await get().fetchPlaylists();
        return;
      } catch (error) {
        saveLocal(ensureLocalLiked(playlists));
        set({
          isCloud: false,
          playlists,
          cloudError: toFallbackMessage(error),
        });
      }
    }

    const updated = get().playlists.map(p =>
      p.id === playlistId
        ? { ...p, songs: p.songs.filter(s => s.videoId !== videoId) }
        : p
    );
    const ensured = ensureLocalLiked(updated);
    saveLocal(ensured);
    set({ playlists: ensured, likedPlaylistId: getLikedPlaylist(ensured)?.id || null });
  },
}));

export default usePlaylistStore;
