export const LIKED_SYSTEM_KEY = 'liked';
export const LIKED_PLAYLIST_NAME = 'Liked Songs';
export const LOCAL_SYSTEM_PLAYLIST_ID = `system:${LIKED_SYSTEM_KEY}`;

export function normalizePlaylistName(name = '') {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isCanonicalLikedPlaylistName(name = '') {
  return normalizePlaylistName(name) === normalizePlaylistName(LIKED_PLAYLIST_NAME);
}

export function isSystemLikedPlaylist(playlist = {}) {
  return playlist?.systemKey === LIKED_SYSTEM_KEY
    || String(playlist?.id || '') === LOCAL_SYSTEM_PLAYLIST_ID;
}

export function getPlaylistCreatedAtMillis(createdAt) {
  if (!createdAt) return 0;

  if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const parsed = new Date(createdAt).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof createdAt?.toMillis === 'function') {
    return createdAt.toMillis();
  }

  if (typeof createdAt?.seconds === 'number') {
    return createdAt.seconds * 1000;
  }

  if (typeof createdAt?._seconds === 'number') {
    return createdAt._seconds * 1000;
  }

  return 0;
}

export function sortPlaylists(playlists = []) {
  return [...playlists].sort((left, right) => {
    const leftIsLiked = isSystemLikedPlaylist(left);
    const rightIsLiked = isSystemLikedPlaylist(right);

    if (leftIsLiked !== rightIsLiked) {
      return leftIsLiked ? -1 : 1;
    }

    const leftIsSystem = Boolean(left?.systemKey);
    const rightIsSystem = Boolean(right?.systemKey);
    if (leftIsSystem !== rightIsSystem) {
      return leftIsSystem ? -1 : 1;
    }

    const createdAtDiff = getPlaylistCreatedAtMillis(right?.createdAt) - getPlaylistCreatedAtMillis(left?.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });
}
