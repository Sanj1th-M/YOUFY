const STORAGE_KEY = 'youfy_lyrics_cache_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const MAX_PLAIN_LENGTH = 60000;
const MAX_SYNCED_LINES = 1500;

const memoryCache = new Map();
let hydrated = false;

export function getLyricsCacheKey(song) {
  if (!song) return '';
  if (isValidVideoId(song.videoId)) return `video:${song.videoId}`;

  const title = normalizeKeyPart(song.title);
  const artist = normalizeKeyPart(song.artist);
  if (!title || !artist) return '';

  return `meta:${title}:${artist}:${normalizeKeyPart(song.album)}:${Number(song.durationSeconds) || 0}`;
}

export function getCachedLyrics(cacheKey) {
  hydrate();
  if (!cacheKey) return null;

  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(cacheKey);
    persist();
    return null;
  }

  return entry.lyrics;
}

export function setCachedLyrics(cacheKey, lyrics) {
  hydrate();
  if (!cacheKey || !lyrics) return;

  const safeLyrics = normalizeLyrics(lyrics);
  const ttl = hasLyrics(safeLyrics) ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
  memoryCache.set(cacheKey, {
    lyrics: safeLyrics,
    savedAt: Date.now(),
    expiresAt: Date.now() + ttl,
  });

  prune();
  persist();
}

export function removeCachedLyrics(cacheKey) {
  hydrate();
  if (!cacheKey) return;
  memoryCache.delete(cacheKey);
  persist();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }

    Object.entries(parsed).forEach(([key, entry]) => {
      if (!isSafeCacheKey(key) || !entry || typeof entry !== 'object') return;
      const expiresAt = Number(entry.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
      memoryCache.set(key, {
        lyrics: normalizeLyrics(entry.lyrics),
        savedAt: Number(entry.savedAt) || Date.now(),
        expiresAt,
      });
    });

    prune();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persist() {
  try {
    const data = Object.fromEntries(
      Array.from(memoryCache.entries())
        .filter(([key, entry]) => isSafeCacheKey(key) && entry?.expiresAt > Date.now())
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or disabled. Memory cache still works for the session.
  }
}

function prune() {
  const entries = Array.from(memoryCache.entries())
    .filter(([, entry]) => entry?.expiresAt > Date.now())
    .sort((left, right) => (right[1].savedAt || 0) - (left[1].savedAt || 0));

  memoryCache.clear();
  entries.slice(0, MAX_ENTRIES).forEach(([key, entry]) => {
    memoryCache.set(key, entry);
  });
}

function normalizeLyrics(lyrics) {
  const synced = Array.isArray(lyrics?.synced)
    ? lyrics.synced
        .slice(0, MAX_SYNCED_LINES)
        .map((line) => ({
          time: Number(line?.time),
          text: sanitizeText(line?.text, 500),
        }))
        .filter((line) => Number.isFinite(line.time))
    : [];

  return {
    synced,
    plain: sanitizeText(lyrics?.plain, MAX_PLAIN_LENGTH),
    source: sanitizeText(lyrics?.source, 20),
    status: sanitizeText(lyrics?.status, 20),
  };
}

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength)
    .trim();
}

function hasLyrics(lyrics) {
  return Boolean(lyrics?.plain || lyrics?.synced?.length);
}

function normalizeKeyPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isValidVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || ''));
}

function isSafeCacheKey(key) {
  return /^(video:[A-Za-z0-9_-]{11}|meta:[a-z0-9 :]{1,500})$/.test(key);
}
