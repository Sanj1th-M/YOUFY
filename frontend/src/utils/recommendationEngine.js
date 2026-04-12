/**
 * Recommendation Engine — Spotify-style scoring system for Youfy
 *
 * Tracks user behavior per song and builds a taste profile to surface
 * personalized recommendations from the global songs catalog.
 *
 * All Firestore calls use modular SDK v9, merge writes, and try/catch.
 */

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';

// ─── Score Weights ────────────────────────────────────────────
const SCORE_WEIGHTS = Object.freeze({
  FULL_LISTEN:       3,
  REPLAY:            4,
  LIKED:             5,
  SKIPPED:          -2,
  ADDED_TO_PLAYLIST: 4,
  RECENCY_BOOST:     2,
});

// ─── In-memory cache ─────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(userId) {
  cache.delete(`taste:${userId}`);
  cache.delete(`recs:${userId}`);
}

// ─── Input validation ────────────────────────────────────────
function isValidSongMeta(songMeta) {
  return songMeta && typeof songMeta === 'object';
}

function sanitizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 500) || fallback;
}

// ─── 1. updateSongScore ──────────────────────────────────────
/**
 * Update the cumulative interaction score for a song.
 *
 * @param {string} userId   - Firebase Auth UID
 * @param {string} videoId  - YouTube video ID
 * @param {object} songMeta - { title, artist, genre, thumbnail, songDuration }
 * @param {string} event    - One of SCORE_WEIGHTS keys
 */
export async function updateSongScore(userId, videoId, songMeta, event) {
  // ── Validate inputs ──
  if (!userId || typeof userId !== 'string') {
    console.warn('[rec] updateSongScore: missing userId');
    return;
  }
  if (!videoId || typeof videoId !== 'string') {
    console.warn('[rec] updateSongScore: missing videoId — skipping write');
    return;
  }
  if (!isValidSongMeta(songMeta)) {
    console.warn('[rec] updateSongScore: invalid songMeta — skipping write');
    return;
  }
  if (!(event in SCORE_WEIGHTS)) {
    console.warn(`[rec] updateSongScore: unknown event "${event}"`);
    return;
  }
  if (!db) {
    console.warn('[rec] Firestore not configured — skipping score update');
    return;
  }

  const weight = SCORE_WEIGHTS[event];
  const docRef = doc(db, 'users', userId, 'songInteractions', videoId);

  try {
    // Read current doc to enforce score floor
    const snap = await getDoc(docRef);
    const existing = snap.exists() ? snap.data() : {};
    const currentScore = typeof existing.score === 'number' ? existing.score : 0;
    const currentPlayCount = typeof existing.playCount === 'number' ? existing.playCount : 0;
    const currentListenTime = typeof existing.totalListenTime === 'number' ? existing.totalListenTime : 0;

    // Calculate new score — never below 0
    let newScore = Math.max(0, currentScore + weight);

    // Recency boost: if played within last 7 days, add bonus
    const now = Date.now();
    const lastPlayed = existing.lastPlayed?.toMillis?.() || 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (lastPlayed && (now - lastPlayed) < sevenDaysMs) {
      newScore = Math.max(0, newScore + SCORE_WEIGHTS.RECENCY_BOOST);
    }

    // Build update payload
    const songDuration = typeof songMeta.durationSeconds === 'number'
      ? songMeta.durationSeconds
      : typeof songMeta.songDuration === 'number'
        ? songMeta.songDuration
        : 0;

    const updatePayload = {
      videoId,
      title:           sanitizeString(songMeta.title, 'Unknown'),
      artist:          sanitizeString(songMeta.artist, 'Unknown'),
      genre:           sanitizeString(songMeta.genre, 'unknown'),
      thumbnail:       sanitizeString(songMeta.thumbnail),
      songDuration,
      score:           newScore,
      lastPlayed:      serverTimestamp(),
    };

    // Event-specific field updates
    if (event === 'FULL_LISTEN' || event === 'REPLAY') {
      updatePayload.playCount = currentPlayCount + 1;
      updatePayload.totalListenTime = currentListenTime + songDuration;
    }
    if (event === 'LIKED') {
      updatePayload.liked = true;
    }
    if (event === 'SKIPPED') {
      updatePayload.skipped = true;
    }
    if (event === 'ADDED_TO_PLAYLIST') {
      updatePayload.addedToPlaylist = true;
    }

    // Only set createdAt on first write
    if (!snap.exists()) {
      updatePayload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, updatePayload, { merge: true });

    // Invalidate cache so next getRecommendations() fetches fresh data
    invalidateCache(userId);

  } catch (err) {
    console.error('[rec] updateSongScore error:', err.message || err);
    // Silent fail — never crash the app for a tracking write
  }
}


// ─── 2. getUserTasteProfile ──────────────────────────────────
/**
 * Analyze user's song interactions to build a taste profile.
 *
 * @param  {string} userId
 * @return {{ topArtists: string[], topGenres: string[], topSongs: object[], interactionCount: number }}
 */
export async function getUserTasteProfile(userId) {
  if (!userId || !db) {
    return { topArtists: [], topGenres: [], topSongs: [], interactionCount: 0 };
  }

  // Check cache
  const cached = getCached(`taste:${userId}`);
  if (cached) return cached;

  try {
    const interactionsRef = collection(db, 'users', userId, 'songInteractions');
    const q = query(interactionsRef, orderBy('score', 'desc'), limit(50));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      const empty = { topArtists: [], topGenres: [], topSongs: [], interactionCount: 0 };
      setCache(`taste:${userId}`, empty);
      return empty;
    }

    const interactions = [];
    const artistScores = {};
    const genreScores = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      interactions.push(data);

      // Accumulate artist scores
      const artist = data.artist || 'Unknown';
      artistScores[artist] = (artistScores[artist] || 0) + (data.score || 0);

      // Accumulate genre scores
      const genre = data.genre || 'unknown';
      if (genre !== 'unknown') {
        genreScores[genre] = (genreScores[genre] || 0) + (data.score || 0);
      }
    });

    // Sort by accumulated score
    const topArtists = Object.entries(artistScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name]) => name);

    const topGenres = Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    const topSongs = interactions.slice(0, 20);

    const result = {
      topArtists,
      topGenres,
      topSongs,
      interactionCount: snapshot.size,
    };

    setCache(`taste:${userId}`, result);
    return result;

  } catch (err) {
    console.error('[rec] getUserTasteProfile error:', err.message || err);
    return { topArtists: [], topGenres: [], topSongs: [], interactionCount: 0 };
  }
}


// ─── 3. getRecommendations ───────────────────────────────────
/**
 * Get 12 personalized song recommendations for a user.
 *
 * Strategy:
 *  1. Build taste profile (top artists, genres)
 *  2. Query global `songs` collection for matching artists/genres
 *  3. Filter out songs the user has already heard
 *  4. Score candidates (artist match = 3pts, genre match = 1pt)
 *  5. Return top 12 sorted by relevance
 *
 * @param  {string} userId
 * @return {object[]} Array of up to 12 song objects
 */
export async function getRecommendations(userId) {
  if (!userId || !db) return [];

  // Check cache
  const cached = getCached(`recs:${userId}`);
  if (cached) return cached;

  try {
    // 1. Get taste profile
    const profile = await getUserTasteProfile(userId);

    // Cold start: fewer than 5 interactions → no recommendations
    if (profile.interactionCount < 5) {
      setCache(`recs:${userId}`, []);
      return [];
    }

    // 2. Collect videoIds the user has already interacted with
    const seenVideoIds = new Set(
      profile.topSongs.map((s) => s.videoId).filter(Boolean)
    );

    // Also fetch the full list of interacted videoIds (up to 200)
    try {
      const allInteractionsRef = collection(db, 'users', userId, 'songInteractions');
      const allQ = query(allInteractionsRef, limit(200));
      const allSnap = await getDocs(allQ);
      allSnap.forEach((docSnap) => {
        const vid = docSnap.data()?.videoId;
        if (vid) seenVideoIds.add(vid);
      });
    } catch {
      // Non-critical — we already have topSongs ids
    }

    // 3. Query global songs catalog by top artists
    const candidates = new Map(); // videoId → { song, relevanceScore }

    if (profile.topArtists.length > 0) {
      // Firestore `in` supports max 30 values
      const artistBatch = profile.topArtists.slice(0, 10);
      try {
        const songsRef = collection(db, 'songs');
        const artistQ = query(
          songsRef,
          where('artist', 'in', artistBatch),
          limit(30)
        );
        const artistSnap = await getDocs(artistQ);
        artistSnap.forEach((docSnap) => {
          const song = docSnap.data();
          if (song.videoId && !seenVideoIds.has(song.videoId)) {
            const existing = candidates.get(song.videoId);
            const artistBoost = 3;
            candidates.set(song.videoId, {
              song,
              relevanceScore: (existing?.relevanceScore || 0) + artistBoost,
            });
          }
        });
      } catch (err) {
        console.warn('[rec] artist query error:', err.message);
      }
    }

    // 4. Query by top genres
    if (profile.topGenres.length > 0) {
      const genreBatch = profile.topGenres.slice(0, 5);
      try {
        const songsRef = collection(db, 'songs');
        const genreQ = query(
          songsRef,
          where('genre', 'in', genreBatch),
          limit(30)
        );
        const genreSnap = await getDocs(genreQ);
        genreSnap.forEach((docSnap) => {
          const song = docSnap.data();
          if (song.videoId && !seenVideoIds.has(song.videoId)) {
            const existing = candidates.get(song.videoId);
            const genreBoost = 1;
            candidates.set(song.videoId, {
              song: existing?.song || song,
              relevanceScore: (existing?.relevanceScore || 0) + genreBoost,
            });
          }
        });
      } catch (err) {
        console.warn('[rec] genre query error:', err.message);
      }
    }

    // 5. If we still don't have enough, fetch some popular songs as fallback
    if (candidates.size < 12) {
      try {
        const songsRef = collection(db, 'songs');
        const fallbackQ = query(songsRef, limit(30));
        const fallbackSnap = await getDocs(fallbackQ);
        fallbackSnap.forEach((docSnap) => {
          const song = docSnap.data();
          if (song.videoId && !seenVideoIds.has(song.videoId) && !candidates.has(song.videoId)) {
            candidates.set(song.videoId, {
              song,
              relevanceScore: 0,
            });
          }
        });
      } catch (err) {
        console.warn('[rec] fallback query error:', err.message);
      }
    }

    // 6. Sort by relevance and return top 12
    const sorted = [...candidates.values()]
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 12)
      .map(({ song }) => ({
        videoId:         song.videoId,
        title:           song.title || 'Unknown',
        artist:          song.artist || 'Unknown',
        genre:           song.genre || 'unknown',
        thumbnail:       song.thumbnail || '',
        durationSeconds: song.durationSeconds || song.songDuration || 0,
      }));

    setCache(`recs:${userId}`, sorted);
    return sorted;

  } catch (err) {
    console.error('[rec] getRecommendations error:', err.message || err);
    return [];
  }
}
