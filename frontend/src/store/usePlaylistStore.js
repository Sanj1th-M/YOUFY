import { create } from 'zustand';
import * as api from '../services/api';
import { updateSongScore } from '../utils/recommendationEngine';
import {
  isCanonicalLikedPlaylistName,
  isSystemLikedPlaylist,
  LIKED_PLAYLIST_NAME,
  LIKED_SYSTEM_KEY,
  LOCAL_SYSTEM_PLAYLIST_ID,
  sortPlaylists,
} from '../utils/playlists';
import useAuthStore from './useAuthStore';

const LOCAL_KEY = 'youfy_local_playlists';
const CLOUD_CACHE_KEY_PREFIX = 'youfy_cloud_playlists:';
const DEFAULT_PLAYLIST_PRIVACY = 'public';
const DEFAULT_PLAYLIST_VOTING = 'off';

function safeParsePlaylists(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function withPlaylistDefaults(playlist = {}) {
  const likedSystemPlaylist = isSystemLikedPlaylist(playlist);
  const privacy = String(playlist?.privacy || '').toLowerCase();
  const voting = String(playlist?.voting || '').toLowerCase();

  return {
    ...playlist,
    id: playlist?.id || (likedSystemPlaylist ? LOCAL_SYSTEM_PLAYLIST_ID : ''),
    name: playlist?.name || (likedSystemPlaylist ? LIKED_PLAYLIST_NAME : 'Untitled Playlist'),
    songs: Array.isArray(playlist?.songs) ? playlist.songs.filter(Boolean) : [],
    description:
      typeof playlist?.description === 'string'
        ? playlist.description
        : '',
    privacy:
      ['private', 'public', 'unlisted'].includes(privacy)
        ? privacy
        : likedSystemPlaylist
          ? 'private'
          : DEFAULT_PLAYLIST_PRIVACY,
    voting: voting === 'on' ? 'on' : DEFAULT_PLAYLIST_VOTING,
  };
}

function migrateLegacyLocalPlaylists(playlists = []) {
  const items = Array.isArray(playlists) ? playlists.filter(Boolean) : [];
  let hasSystemLiked = false;

  const normalized = items.map((playlist) => {
    if (!isSystemLikedPlaylist(playlist)) {
      return playlist;
    }

    hasSystemLiked = true;
    return {
      ...playlist,
      id: LOCAL_SYSTEM_PLAYLIST_ID,
      systemKey: LIKED_SYSTEM_KEY,
      name: LIKED_PLAYLIST_NAME,
    };
  });

  if (hasSystemLiked) {
    return normalized;
  }

  const legacyLiked = normalized.filter((playlist) => (
    !playlist?.systemKey
    && isCanonicalLikedPlaylistName(playlist?.name)
  ));

  if (legacyLiked.length !== 1) {
    return normalized;
  }

  const legacyId = String(legacyLiked[0]?.id || '');
  return normalized.map((playlist) => (
    String(playlist?.id || '') === legacyId
      ? {
          ...playlist,
          id: LOCAL_SYSTEM_PLAYLIST_ID,
          systemKey: LIKED_SYSTEM_KEY,
          name: LIKED_PLAYLIST_NAME,
        }
      : playlist
  ));
}

function normalizePlaylists(playlists = []) {
  return sortPlaylists(playlists.map(withPlaylistDefaults));
}

function normalizeLocalPlaylists(playlists = []) {
  return normalizePlaylists(migrateLegacyLocalPlaylists(playlists));
}

function getLocal() {
  return normalizeLocalPlaylists(safeParsePlaylists(localStorage.getItem(LOCAL_KEY)));
}

function saveLocal(playlists) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(normalizeLocalPlaylists(playlists)));
}

function getCloudCacheKey(uid = '') {
  return `${CLOUD_CACHE_KEY_PREFIX}${uid}`;
}

function getCloudCache(uid) {
  if (!uid) return [];
  return normalizePlaylists(safeParsePlaylists(localStorage.getItem(getCloudCacheKey(uid))));
}

function saveCloudCache(uid, playlists) {
  if (!uid) return;
  localStorage.setItem(getCloudCacheKey(uid), JSON.stringify(normalizePlaylists(playlists)));
}

const localPlaylist = (name) => ({
  id: Date.now().toString(),
  name,
  songs: [],
  description: '',
  privacy: DEFAULT_PLAYLIST_PRIVACY,
  voting: DEFAULT_PLAYLIST_VOTING,
  createdAt: new Date().toISOString(),
});

const localSystemPlaylist = (systemKey, name) => ({
  id: LOCAL_SYSTEM_PLAYLIST_ID,
  systemKey,
  name,
  songs: [],
  description: '',
  privacy: 'private',
  voting: DEFAULT_PLAYLIST_VOTING,
  createdAt: new Date().toISOString(),
});

function ensureLocalLiked(playlists = []) {
  const normalized = normalizeLocalPlaylists(playlists);
  const liked = normalized.find(isSystemLikedPlaylist);
  if (liked) {
    return sortPlaylists([liked, ...normalized.filter((playlist) => !isSystemLikedPlaylist(playlist))]);
  }

  return sortPlaylists([localSystemPlaylist(LIKED_SYSTEM_KEY, LIKED_PLAYLIST_NAME), ...normalized]);
}

function getLikedPlaylist(playlists = []) {
  return playlists.find(isSystemLikedPlaylist) || null;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.error
    || error?.message
    || 'Cloud playlist sync is unavailable right now.'
  );
}

function toCloudFallbackMessage(error) {
  return `${getErrorMessage(error)} Showing your last synced library.`;
}

function sanitizePlaylistUpdates(updates = {}) {
  const next = {};

  if (typeof updates?.name === 'string') {
    const name = updates.name.trim().slice(0, 100);
    if (name) next.name = name;
  }

  if (typeof updates?.description === 'string') {
    next.description = updates.description.trim().slice(0, 300);
  }

  if (typeof updates?.privacy === 'string') {
    const privacy = updates.privacy.trim().toLowerCase();
    if (['private', 'public', 'unlisted'].includes(privacy)) {
      next.privacy = privacy;
    }
  }

  if (typeof updates?.voting === 'string') {
    const voting = updates.voting.trim().toLowerCase();
    if (['off', 'on'].includes(voting)) {
      next.voting = voting;
    }
  }

  return next;
}

function resolveAuthenticatedPlaylists(user, currentPlaylists = []) {
  const cached = getCloudCache(user?.uid);
  if (cached.length > 0) {
    return cached;
  }

  return normalizePlaylists(currentPlaylists);
}

function applyCloudPlaylists(set, user, playlists) {
  const normalized = normalizePlaylists(playlists);
  const liked = getLikedPlaylist(normalized);

  saveCloudCache(user?.uid, normalized);
  set({
    isCloud: true,
    playlists: normalized,
    cloudError: null,
    likedPlaylistId: liked?.id || null,
  });

  return normalized;
}

function keepAuthenticatedLibrary(set, get, user, error) {
  const playlists = resolveAuthenticatedPlaylists(user, get().playlists);
  const liked = getLikedPlaylist(playlists);

  set({
    isCloud: true,
    playlists,
    cloudError: toCloudFallbackMessage(error),
    likedPlaylistId: liked?.id || null,
  });

  return playlists;
}

const usePlaylistStore = create((set, get) => ({
  playlists: [],
  loading: false,
  isCloud: false,
  cloudError: null,

  likedPlaylistId: null,

  isSongLiked: (videoId) => {
    if (!videoId) return false;
    const liked = getLikedPlaylist(get().playlists);
    return Boolean(liked?.songs?.some((song) => song?.videoId === videoId));
  },

  toggleLike: async (song) => {
    if (!song?.videoId) return;

    const { playlists, isCloud } = get();
    const liked = getLikedPlaylist(playlists);

    if (!liked && !isCloud) {
      const updated = ensureLocalLiked(playlists);
      saveLocal(updated);
      set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    }

    const current = getLikedPlaylist(get().playlists);
    if (!current) return;

    const exists = current.songs?.some((playlistSong) => playlistSong?.videoId === song.videoId);
    if (exists) {
      await get().removeSong(current.id, song.videoId);
    } else {
      await get().addSong(current.id, song);

      const userId = useAuthStore.getState()?.user?.uid;
      if (userId) {
        updateSongScore(userId, song.videoId, {
          title: song.title || 'Unknown',
          artist: song.artist || 'Unknown',
          genre: song.genre || 'unknown',
          thumbnail: song.thumbnail || '',
          durationSeconds: song.durationSeconds || 0,
        }, 'LIKED');
      }
    }
  },

  init: async (user) => {
    if (user) {
      set({ loading: true });

      try {
        const playlists = await api.getPlaylists();
        applyCloudPlaylists(set, user, playlists);
      } catch (error) {
        keepAuthenticatedLibrary(set, get, user, error);
      } finally {
        set({ loading: false });
      }

      return;
    }

    const localPlaylists = ensureLocalLiked(getLocal());
    saveLocal(localPlaylists);
    set({
      isCloud: false,
      playlists: localPlaylists,
      cloudError: null,
      likedPlaylistId: getLikedPlaylist(localPlaylists)?.id || null,
    });
  },

  fetchPlaylists: async () => {
    const user = useAuthStore.getState()?.user;

    set({ loading: true });
    try {
      const playlists = await api.getPlaylists();
      applyCloudPlaylists(set, user, playlists);
    } catch (error) {
      if (user) {
        keepAuthenticatedLibrary(set, get, user, error);
      } else {
        const localPlaylists = ensureLocalLiked(getLocal());
        saveLocal(localPlaylists);
        set({
          playlists: localPlaylists,
          isCloud: false,
          cloudError: null,
          likedPlaylistId: getLikedPlaylist(localPlaylists)?.id || null,
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  createPlaylist: async (name) => {
    const user = useAuthStore.getState()?.user;
    const { isCloud, playlists } = get();

    if (isCloud) {
      try {
        const { playlist } = await api.createPlaylist(name);
        const created = withPlaylistDefaults(playlist);
        const updated = normalizePlaylists([created, ...playlists]);
        saveCloudCache(user?.uid, updated);
        set({ playlists: updated, cloudError: null });
        return created;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return null;
      }
    }

    set({ cloudError: null });
    const created = withPlaylistDefaults(localPlaylist(name));
    const updated = ensureLocalLiked([created, ...get().playlists]);
    saveLocal(updated);
    set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    return created;
  },

  updatePlaylist: async (id, updates) => {
    const sanitized = sanitizePlaylistUpdates(updates);
    if (!id || Object.keys(sanitized).length === 0) {
      return null;
    }

    const user = useAuthStore.getState()?.user;
    const { isCloud, playlists } = get();
    const playlist = playlists.find((item) => item.id === id);
    if (!playlist || playlist.systemKey) {
      return null;
    }

    if (isCloud) {
      try {
        await api.updatePlaylist(id, sanitized);
        const updated = normalizePlaylists(
          playlists.map((item) => (
            item.id === id ? withPlaylistDefaults({ ...item, ...sanitized }) : item
          ))
        );
        saveCloudCache(user?.uid, updated);
        set({ playlists: updated, cloudError: null });
        return updated.find((item) => item.id === id) || null;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return null;
      }
    }

    set({ cloudError: null });
    const updated = ensureLocalLiked(
      playlists.map((item) => (
        item.id === id ? withPlaylistDefaults({ ...item, ...sanitized }) : item
      ))
    );
    saveLocal(updated);
    set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    return updated.find((item) => item.id === id) || null;
  },

  deletePlaylist: async (id) => {
    const user = useAuthStore.getState()?.user;
    const { isCloud, playlists } = get();
    const playlist = playlists.find((item) => item.id === id);

    if (playlist?.systemKey) {
      return false;
    }

    if (isCloud) {
      try {
        await api.deletePlaylist(id);
        const updated = normalizePlaylists(get().playlists.filter((item) => item.id !== id));
        saveCloudCache(user?.uid, updated);
        set({ playlists: updated, cloudError: null, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
        return true;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return false;
      }
    }

    const updated = ensureLocalLiked(get().playlists.filter((item) => item.id !== id));
    saveLocal(updated);
    set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    return true;
  },

  addSong: async (playlistId, song) => {
    const { isCloud } = get();

    if (isCloud) {
      try {
        await api.addSongToPlaylist(playlistId, song);
        await get().fetchPlaylists();

        const userId = useAuthStore.getState()?.user?.uid;
        if (userId && song?.videoId) {
          updateSongScore(userId, song.videoId, {
            title: song.title || 'Unknown',
            artist: song.artist || 'Unknown',
            genre: song.genre || 'unknown',
            thumbnail: song.thumbnail || '',
            durationSeconds: song.durationSeconds || 0,
          }, 'ADDED_TO_PLAYLIST');
        }

        return true;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return false;
      }
    }

    const updated = get().playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
      if (songs.some((playlistSong) => playlistSong?.videoId === song?.videoId)) return playlist;
      return { ...playlist, songs: [...songs, song] };
    });
    const ensured = ensureLocalLiked(updated);
    saveLocal(ensured);
    set({ playlists: ensured, likedPlaylistId: getLikedPlaylist(ensured)?.id || null });

    const userId = useAuthStore.getState()?.user?.uid;
    if (userId && song?.videoId) {
      updateSongScore(userId, song.videoId, {
        title: song.title || 'Unknown',
        artist: song.artist || 'Unknown',
        genre: song.genre || 'unknown',
        thumbnail: song.thumbnail || '',
        durationSeconds: song.durationSeconds || 0,
      }, 'ADDED_TO_PLAYLIST');
    }

    return true;
  },

  removeSong: async (playlistId, videoId) => {
    const { isCloud } = get();

    if (isCloud) {
      try {
        await api.removeSongFromPlaylist(playlistId, videoId);
        await get().fetchPlaylists();
        return true;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return false;
      }
    }

    const updated = get().playlists.map((playlist) => (
      playlist.id === playlistId
        ? { ...playlist, songs: playlist.songs.filter((song) => song.videoId !== videoId) }
        : playlist
    ));
    const ensured = ensureLocalLiked(updated);
    saveLocal(ensured);
    set({ playlists: ensured, likedPlaylistId: getLikedPlaylist(ensured)?.id || null });
    return true;
  },

  copySongsToPlaylist: async (targetPlaylistId, songs = []) => {
    if (!targetPlaylistId || !Array.isArray(songs) || songs.length === 0) {
      return 0;
    }

    const { isCloud, playlists } = get();
    const target = playlists.find((playlist) => playlist.id === targetPlaylistId);
    if (!target) {
      return 0;
    }

    const existingIds = new Set((target.songs || []).map((song) => song?.videoId).filter(Boolean));
    const uniqueSongs = songs.filter((song) => song?.videoId && !existingIds.has(song.videoId));

    if (uniqueSongs.length === 0) {
      return 0;
    }

    if (isCloud) {
      try {
        for (const song of uniqueSongs) {
          await api.addSongToPlaylist(targetPlaylistId, song);
        }
        await get().fetchPlaylists();
        return uniqueSongs.length;
      } catch (error) {
        set({ cloudError: toCloudFallbackMessage(error) });
        return 0;
      }
    }

    set({ cloudError: null });
    const updated = ensureLocalLiked(
      playlists.map((playlist) => (
        playlist.id === targetPlaylistId
          ? withPlaylistDefaults({ ...playlist, songs: [...(playlist.songs || []), ...uniqueSongs] })
          : playlist
      ))
    );
    saveLocal(updated);
    set({ playlists: updated, likedPlaylistId: getLikedPlaylist(updated)?.id || null });
    return uniqueSongs.length;
  },
}));

export default usePlaylistStore;
