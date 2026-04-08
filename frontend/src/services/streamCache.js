// In-memory stream URL cache — frontend side
// Stream URLs are valid ~6hrs, we cache for 5hrs safely
// This makes replaying the same song instant (no backend call)

const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours in ms

const cache = new Map(); // videoId → { url, expiresAt }

export function getCachedUrl(videoId) {
  const entry = cache.get(videoId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(videoId); // expired — remove
    return null;
  }
  return entry.url;
}

export function setCachedUrl(videoId, url) {
  cache.set(videoId, {
    url,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function clearCache() {
  cache.clear();
}
