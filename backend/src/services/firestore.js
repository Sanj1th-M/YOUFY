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
  },
};

const playlistRef = (uid, id) =>
  getDb().collection('users').doc(uid).collection('playlists').doc(id);
const recentRef = (uid) =>
  getDb().collection('users').doc(uid).collection('meta').doc('recentlyPlayed');

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

  const snap = await getDb()
    .collection('users').doc(uid)
    .collection('playlists')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function createPlaylist(uid, name) {
  const ref = getDb().collection('users').doc(uid).collection('playlists').doc();
  const data = {
    name,
    songs: [],
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
