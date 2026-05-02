const admin = require('../config/firebase');

function getDb() {
  if (!admin.isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }

  return admin.firestore();
}

const SYSTEM_PLAYLISTS = {
  liked: {
    systemKey: 'liked',
    name: 'Liked Songs',
    description: 'Songs you have liked in Youfy.',
    privacy: 'private',
    voting: 'off',
  },
};

const playlistRef = (uid, id) =>
  getDb().collection('users').doc(uid).collection('playlists').doc(id);
const recentRef = (uid) =>
  getDb().collection('users').doc(uid).collection('meta').doc('recentlyPlayed');

function toPlaylistRecord(doc) {
  return { id: doc.id, ...doc.data() };
}

function getCreatedAtMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
  if (typeof createdAt?._seconds === 'number') return createdAt._seconds * 1000;

  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPlaylists(playlists = []) {
  return [...playlists].sort((left, right) => {
    const leftIsLiked = left?.systemKey === SYSTEM_PLAYLISTS.liked.systemKey;
    const rightIsLiked = right?.systemKey === SYSTEM_PLAYLISTS.liked.systemKey;
    if (leftIsLiked !== rightIsLiked) {
      return leftIsLiked ? -1 : 1;
    }

    const createdAtDiff = getCreatedAtMillis(right?.createdAt) - getCreatedAtMillis(left?.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });
}

function normalizePlaylistTitle(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function shouldMergeImportedLikedPlaylist(playlist = {}) {
  if (!playlist?.importedFrom || playlist?.systemKey) {
    return false;
  }

  const normalized = normalizePlaylistTitle(playlist?.name);
  return normalized === 'liked songs'
    || normalized === 'liked music'
    || normalized === 'liked videos'
    || normalized === 'my likes'
    || /^liked songs ?\d+$/.test(normalized);
}

function mergeSongsByVideoId(primarySongs = [], secondarySongs = []) {
  const merged = [];
  const seen = new Set();

  for (const song of [...primarySongs, ...secondarySongs]) {
    if (!song?.videoId || seen.has(song.videoId)) {
      continue;
    }

    seen.add(song.videoId);
    merged.push(song);
  }

  return merged;
}

async function migrateImportedLikedPlaylists(uid, playlists = []) {
  const importedLikedPlaylists = playlists
    .filter(shouldMergeImportedLikedPlaylist)
    .sort((left, right) => getCreatedAtMillis(right?.createdAt) - getCreatedAtMillis(left?.createdAt));

  if (importedLikedPlaylists.length === 0) {
    return sortPlaylists(playlists);
  }

  const systemPlaylist = playlists.find((playlist) => playlist?.systemKey === SYSTEM_PLAYLISTS.liked.systemKey)
    || await ensureSystemPlaylist(uid, SYSTEM_PLAYLISTS.liked.systemKey);

  const importedSongs = importedLikedPlaylists.flatMap((playlist) => (
    Array.isArray(playlist?.songs) ? playlist.songs : []
  ));
  const existingSongs = Array.isArray(systemPlaylist?.songs) ? systemPlaylist.songs : [];
  const mergedSongs = mergeSongsByVideoId(importedSongs, existingSongs);

  await playlistRef(uid, systemPlaylist.id).set({
    name: SYSTEM_PLAYLISTS.liked.name,
    songs: mergedSongs,
    description: SYSTEM_PLAYLISTS.liked.description,
    privacy: SYSTEM_PLAYLISTS.liked.privacy,
    voting: SYSTEM_PLAYLISTS.liked.voting,
    systemKey: SYSTEM_PLAYLISTS.liked.systemKey,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await Promise.all(importedLikedPlaylists.map((playlist) => playlistRef(uid, playlist.id).delete()));

  const remainingPlaylists = playlists.filter((playlist) => (
    playlist.id !== systemPlaylist.id
    && !importedLikedPlaylists.some((imported) => imported.id === playlist.id)
  ));

  return sortPlaylists([
    {
      ...systemPlaylist,
      name: SYSTEM_PLAYLISTS.liked.name,
      songs: mergedSongs,
      description: SYSTEM_PLAYLISTS.liked.description,
      privacy: SYSTEM_PLAYLISTS.liked.privacy,
      voting: SYSTEM_PLAYLISTS.liked.voting,
      systemKey: SYSTEM_PLAYLISTS.liked.systemKey,
    },
    ...remainingPlaylists,
  ]);
}

async function getPlaylist(uid, id) {
  const doc = await playlistRef(uid, id).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function ensureSystemPlaylist(uid, systemKey) {
  const definition = SYSTEM_PLAYLISTS[systemKey];
  if (!definition) {
    throw new Error(`Unknown system playlist: ${systemKey}`);
  }

  const col = getDb().collection('users').doc(uid).collection('playlists');
  const snap = await col.where('systemKey', '==', systemKey).limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  const ref = col.doc();
  const data = {
    name: definition.name,
    songs: [],
    description: definition.description || '',
    privacy: definition.privacy || 'private',
    voting: definition.voting || 'off',
    systemKey,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

async function getSystemPlaylist(uid, systemKey) {
  const col = getDb().collection('users').doc(uid).collection('playlists');
  const snap = await col.where('systemKey', '==', systemKey).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getPlaylists(uid) {
  // Ensure default system playlists exist for new users.
  await ensureSystemPlaylist(uid, SYSTEM_PLAYLISTS.liked.systemKey);

  const collection = getDb()
    .collection('users').doc(uid)
    .collection('playlists');

  try {
    const snap = await collection.orderBy('createdAt', 'desc').get();
    return migrateImportedLikedPlaylists(uid, snap.docs.map(toPlaylistRecord));
  } catch {
    const snap = await collection.get();
    return migrateImportedLikedPlaylists(uid, snap.docs.map(toPlaylistRecord));
  }
}

async function createPlaylist(uid, name) {
  const ref = getDb().collection('users').doc(uid).collection('playlists').doc();
  const data = {
    name,
    songs: [],
    description: '',
    privacy: 'public',
    voting: 'off',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

async function updatePlaylist(uid, id, updates) {
  await playlistRef(uid, id).update(updates);
}

async function deletePlaylist(uid, id) {
  await playlistRef(uid, id).delete();
}

async function addSong(uid, playlistId, song) {
  await playlistRef(uid, playlistId).update({
    songs: admin.firestore.FieldValue.arrayUnion(song),
  });
}

async function removeSong(uid, playlistId, videoId) {
  const doc = await playlistRef(uid, playlistId).get();
  const songs = (doc.data()?.songs || []).filter(s => s.videoId !== videoId);
  await playlistRef(uid, playlistId).update({ songs });
}

async function getRecentlyPlayed(uid, limit = 10) {
  const doc = await recentRef(uid).get();
  const songs = doc.data()?.songs || [];
  return songs.slice(0, limit);
}

async function addRecentlyPlayed(uid, song) {
  const ref = recentRef(uid);
  const doc = await ref.get();
  const songs = doc.data()?.songs || [];
  const filtered = songs.filter((entry) => entry.videoId !== song.videoId);

  await ref.set(
    {
      songs: [song, ...filtered].slice(0, 20),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = {
  SYSTEM_PLAYLISTS,
  ensureSystemPlaylist,
  getSystemPlaylist,
  getPlaylist,
  getPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSong,
  removeSong,
  getRecentlyPlayed,
  addRecentlyPlayed,
};
