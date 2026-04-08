const admin = require('../config/firebase');

function getDb() {
  if (!admin.isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }

  return admin.firestore();
}

const playlistRef = (uid, id) =>
  getDb().collection('users').doc(uid).collection('playlists').doc(id);

async function getPlaylists(uid) {
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

module.exports = { getPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addSong, removeSong };
