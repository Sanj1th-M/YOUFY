const admin = require('../../config/firebase');
const { SYSTEM_PLAYLISTS, ensureSystemPlaylist } = require('../../services/firestore');
const { decryptString, encryptString, sha256Base64Url } = require('./crypto');

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const STORAGE_TIMEOUT_MS = Math.max(1000, Number(process.env.PLAYLIST_IMPORT_STORAGE_TIMEOUT_MS) || 8000);

function getDb() {
  if (!admin.isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }
  return admin.firestore();
}

function nowMillis() {
  return Date.now();
}

function timestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function sanitizeText(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

function sanitizeSourceTrack(track = {}) {
  return {
    name: sanitizeText(track.name, 200),
    artist: sanitizeText(track.artist, 200),
    album: sanitizeText(track.album, 200),
    duration: Math.max(0, Math.floor(Number(track.duration) || 0)),
  };
}

function sanitizeMatchedSong(song = {}) {
  return {
    videoId: sanitizeText(song.videoId, 20),
    title: sanitizeText(song.title || song.name, 200),
    artist: sanitizeText(song.artist, 200),
    thumbnail: sanitizeText(song.thumbnail, 500),
    durationSeconds: Math.max(0, Math.floor(Number(song.durationSeconds || song.duration) || 0)),
    album: sanitizeText(song.album, 200),
  };
}

function normalizePlaylistTitle(title) {
  return sanitizeText(title, 100)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldImportIntoLikedSongs(title) {
  const normalized = normalizePlaylistTitle(title);
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

function createStorageUnavailableError() {
  const error = new Error('Playlist import storage is unavailable. Check Firebase/Firestore configuration.');
  error.status = 503;
  error.code = 'PLAYLIST_IMPORT_STORAGE_UNAVAILABLE';
  return error;
}

function mapStorageError(error) {
  if (error?.status) {
    return error;
  }

  const message = String(error?.message || '').toLowerCase();
  if (!message) {
    return createStorageUnavailableError();
  }

  if (message.includes('firebase is not configured')) {
    return createStorageUnavailableError();
  }

  if (
    message.includes('deadline') ||
    message.includes('timed out') ||
    message.includes('unavailable') ||
    message.includes('offline') ||
    message.includes('not found') ||
    message.includes('not_found')
  ) {
    return createStorageUnavailableError();
  }

  return error;
}

async function withStorageGuard(operation) {
  let timer = null;

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createStorageUnavailableError()), STORAGE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    throw mapStorageError(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stateRef(stateHash) {
  return getDb().collection('playlistImportStates').doc(stateHash);
}

function userRef(uid) {
  return getDb().collection('users').doc(uid);
}

function tokenRef(uid, source) {
  return userRef(uid).collection('playlistImportTokens').doc(source);
}

function jobRef(uid, jobId) {
  return userRef(uid).collection('playlistImportJobs').doc(jobId);
}

async function createOAuthState({ uid, source, state, codeVerifier }) {
  const stateHash = sha256Base64Url(state);
  await withStorageGuard(() => stateRef(stateHash).set({
    uid,
    source,
    codeVerifier: encryptString(codeVerifier),
    expiresAtMillis: nowMillis() + STATE_TTL_MS,
    createdAt: timestamp(),
  }));
  return stateHash;
}

async function consumeOAuthState({ state, source }) {
  return withStorageGuard(async () => {
    const stateHash = sha256Base64Url(state);
    const ref = stateRef(stateHash);
    const doc = await ref.get();

    if (!doc.exists) {
      const error = new Error('Invalid OAuth state');
      error.status = 400;
      throw error;
    }

    await ref.delete();

    const data = doc.data() || {};
    if (data.source !== source || !data.uid || Number(data.expiresAtMillis) < nowMillis()) {
      const error = new Error('Expired OAuth state');
      error.status = 400;
      throw error;
    }

    return {
      uid: data.uid,
      codeVerifier: decryptString(data.codeVerifier),
    };
  });
}

async function storeProviderToken(uid, source, tokenResponse) {
  await withStorageGuard(async () => {
    const expiresInSeconds = Math.max(0, Number(tokenResponse.expires_in) || 0);
    const existing = await tokenRef(uid, source).get();
    const existingData = existing.exists ? existing.data() : {};
    const refreshToken = tokenResponse.refresh_token
      ? encryptString(tokenResponse.refresh_token)
      : existingData.encryptedRefreshToken || null;

    await tokenRef(uid, source).set({
      source,
      encryptedAccessToken: encryptString(tokenResponse.access_token),
      encryptedRefreshToken: refreshToken,
      scope: sanitizeText(tokenResponse.scope || existingData.scope || '', 500),
      tokenType: sanitizeText(tokenResponse.token_type || existingData.tokenType || 'Bearer', 40),
      expiresAtMillis: nowMillis() + (expiresInSeconds * 1000),
      updatedAt: timestamp(),
    }, { merge: true });
  });
}

async function getProviderToken(uid, source) {
  return withStorageGuard(async () => {
    const doc = await tokenRef(uid, source).get();
    if (!doc.exists) return null;

    const data = doc.data() || {};
    return {
      accessToken: decryptString(data.encryptedAccessToken),
      refreshToken: data.encryptedRefreshToken ? decryptString(data.encryptedRefreshToken) : '',
      expiresAtMillis: Number(data.expiresAtMillis) || 0,
      scope: data.scope || '',
    };
  });
}

async function getConnectedSources(uid) {
  return withStorageGuard(async () => {
    const snap = await userRef(uid).collection('playlistImportTokens').get();
    const connected = {};
    snap.docs.forEach(doc => {
      const data = doc.data() || {};
      connected[doc.id] = {
        connected: Boolean(data.encryptedAccessToken),
        expiresSoon: Number(data.expiresAtMillis) < nowMillis() + TOKEN_REFRESH_SKEW_MS,
        updatedAt: data.updatedAt || null,
      };
    });
    return connected;
  });
}

async function createPreviewJob({ uid, source, sourcePlaylistId }) {
  return withStorageGuard(async () => {
    const ref = userRef(uid).collection('playlistImportJobs').doc();
    const data = {
      id: ref.id,
      uid,
      source,
      sourcePlaylistId: sanitizeText(sourcePlaylistId, 128),
      status: 'queued',
      progress: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      totalTracks: 0,
      matches: [],
      unmatchedTracks: [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    await ref.set(data);
    return { id: ref.id, ...data };
  });
}

async function updateJob(uid, jobId, updates) {
  const safe = {
    ...updates,
    updatedAt: timestamp(),
  };

  await withStorageGuard(() => jobRef(uid, jobId).set(safe, { merge: true }));
}

async function getJob(uid, jobId) {
  return withStorageGuard(async () => {
    const doc = await jobRef(uid, jobId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  });
}

async function findActivePreviewJob(uid, source, sourcePlaylistId) {
  return withStorageGuard(async () => {
    const snap = await userRef(uid)
      .collection('playlistImportJobs')
      .where('source', '==', source)
      .where('sourcePlaylistId', '==', sanitizeText(sourcePlaylistId, 128))
      .where('status', 'in', ['queued', 'processing', 'preview_ready'])
      .limit(5)
      .get();

    if (snap.empty) return null;
    const [doc] = snap.docs.sort((left, right) => {
      const leftMillis = left.data()?.createdAt?.toMillis?.() || 0;
      const rightMillis = right.data()?.createdAt?.toMillis?.() || 0;
      return rightMillis - leftMillis;
    });
    return { id: doc.id, ...doc.data() };
  });
}

async function completePreviewJob(uid, jobId, payload) {
  await withStorageGuard(async () => {
    const matches = Array.isArray(payload.matches) ? payload.matches.map(item => ({
      index: Number(item.index) || 0,
      status: item.status === 'matched' ? 'matched' : 'unmatched',
      score: Math.max(0, Math.min(1, Number(item.score) || 0)),
      sourceTrack: sanitizeSourceTrack(item.sourceTrack),
      youfyTrack: item.youfyTrack ? sanitizeMatchedSong(item.youfyTrack) : null,
    })) : [];

    const unmatchedTracks = matches
      .filter(item => item.status !== 'matched')
      .map(item => item.sourceTrack);

    await updateJob(uid, jobId, {
      status: 'preview_ready',
      progress: 100,
      playlistTitle: sanitizeText(payload.playlistTitle || 'Imported Playlist', 200),
      totalTracks: matches.length,
      matchedCount: matches.filter(item => item.status === 'matched').length,
      unmatchedCount: unmatchedTracks.length,
      matches,
      unmatchedTracks,
    });

    await userRef(uid).collection('playlistImportUnmatched').doc(jobId).set({
      source: payload.source,
      sourcePlaylistId: sanitizeText(payload.sourcePlaylistId, 128),
      playlistTitle: sanitizeText(payload.playlistTitle || 'Imported Playlist', 200),
      tracks: unmatchedTracks,
      updatedAt: timestamp(),
    });
  });
}

async function failJob(uid, jobId, reason) {
  await updateJob(uid, jobId, {
    status: 'failed',
    error: sanitizeText(reason || 'Import failed', 200),
  });
}

async function createImportedPlaylist(uid, job) {
  return withStorageGuard(async () => {
    const title = sanitizeText(job.playlistTitle || 'Imported Playlist', 100);
    const songs = (Array.isArray(job.matches) ? job.matches : [])
      .filter(item => item.status === 'matched' && item.youfyTrack?.videoId)
      .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
      .map(item => sanitizeMatchedSong(item.youfyTrack));

    if (shouldImportIntoLikedSongs(title)) {
      const systemPlaylist = await ensureSystemPlaylist(uid, SYSTEM_PLAYLISTS.liked.systemKey);
      const existingSongs = Array.isArray(systemPlaylist?.songs)
        ? systemPlaylist.songs.map(sanitizeMatchedSong)
        : [];
      const mergedSongs = mergeSongsByVideoId(songs, existingSongs);

      await userRef(uid).collection('playlists').doc(systemPlaylist.id).set({
        name: SYSTEM_PLAYLISTS.liked.name,
        songs: mergedSongs,
        description: SYSTEM_PLAYLISTS.liked.description,
        privacy: SYSTEM_PLAYLISTS.liked.privacy,
        voting: SYSTEM_PLAYLISTS.liked.voting,
        systemKey: SYSTEM_PLAYLISTS.liked.systemKey,
        updatedAt: timestamp(),
      }, { merge: true });

      await updateJob(uid, job.id, {
        status: 'imported',
        playlistId: systemPlaylist.id,
        importedAt: timestamp(),
      });

      return {
        ...systemPlaylist,
        id: systemPlaylist.id,
        name: SYSTEM_PLAYLISTS.liked.name,
        songs: mergedSongs,
        description: SYSTEM_PLAYLISTS.liked.description,
        privacy: SYSTEM_PLAYLISTS.liked.privacy,
        voting: SYSTEM_PLAYLISTS.liked.voting,
        systemKey: SYSTEM_PLAYLISTS.liked.systemKey,
      };
    }

    const ref = userRef(uid).collection('playlists').doc();
    const data = {
      name: title,
      songs,
      importedFrom: sanitizeText(job.source, 40),
      importJobId: job.id,
      createdAt: timestamp(),
    };

    await ref.set(data);
    await updateJob(uid, job.id, {
      status: 'imported',
      playlistId: ref.id,
      importedAt: timestamp(),
    });

    return { id: ref.id, ...data };
  });
}

async function recordAnalytics(uid, jobId, event, metrics = {}) {
  await withStorageGuard(() => getDb().collection('playlistImportAnalytics').add({
    uid,
    jobId,
    event: sanitizeText(event, 80),
    source: sanitizeText(metrics.source, 40),
    totalTracks: Math.max(0, Math.floor(Number(metrics.totalTracks) || 0)),
    matchedCount: Math.max(0, Math.floor(Number(metrics.matchedCount) || 0)),
    unmatchedCount: Math.max(0, Math.floor(Number(metrics.unmatchedCount) || 0)),
    matchAccuracy: Math.max(0, Math.min(1, Number(metrics.matchAccuracy) || 0)),
    createdAt: timestamp(),
  }));
}

module.exports = {
  TOKEN_REFRESH_SKEW_MS,
  completePreviewJob,
  consumeOAuthState,
  createImportedPlaylist,
  createOAuthState,
  createPreviewJob,
  failJob,
  findActivePreviewJob,
  getConnectedSources,
  getJob,
  getProviderToken,
  mergeSongsByVideoId,
  normalizePlaylistTitle,
  recordAnalytics,
  sanitizeMatchedSong,
  sanitizeSourceTrack,
  shouldImportIntoLikedSongs,
  storeProviderToken,
  updateJob,
};
