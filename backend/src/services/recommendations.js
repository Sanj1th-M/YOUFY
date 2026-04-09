const { searchSongs, getHomeSections } = require('./ytmusic');
const {
  trendingCache,
  recommendationArtistCache,
  recommendationPoolCache,
} = require('./cache');

function getBestThumbnail(thumbnails, fallback = '') {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
    return fallback;
  }

  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) {
    return fallback;
  }

  return url
    .replace(/=w\d+-h\d+(-[^&]+)?/, '=w1280-h1280')
    .replace(/=s\d+/, '=s1280');
}

function toDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const parts = value
    .split(':')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 0) {
    return 0;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatDuration(seconds) {
  if (!seconds) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function normalizeTrack(song) {
  const durationSeconds = toDurationSeconds(song?.durationSeconds ?? song?.duration);

  return {
    videoId: song?.videoId || '',
    title: song?.name || song?.title || 'Unknown',
    artist: song?.artist?.name || song?.artists?.[0]?.name || song?.artist || 'Unknown',
    thumbnail: getBestThumbnail(song?.thumbnails, song?.thumbnail || ''),
    duration: formatDuration(durationSeconds),
    durationSeconds,
  };
}

function shuffle(list) {
  const copy = [...list];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function makeArtistCacheKey(artist, perArtist) {
  return `recommendation-artist:${artist.toLowerCase()}:${perArtist}`;
}

function makePoolCacheKey(recent, perArtist) {
  const fingerprint = recent
    .map((track) => `${track.videoId || ''}:${String(track.artist || '').toLowerCase()}`)
    .join('|');

  return `recommendation-pool:${perArtist}:${fingerprint}`;
}

async function getArtistCandidates(artist, perArtist) {
  const cacheKey = makeArtistCacheKey(artist, perArtist);
  const cached = recommendationArtistCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const results = await searchSongs(`${artist} songs`);
  const tracks = (Array.isArray(results) ? results : [])
    .slice(0, perArtist)
    .map(normalizeTrack)
    .filter((track) => track.videoId);

  recommendationArtistCache.set(cacheKey, tracks);
  return tracks;
}

async function buildRecommendationPool(recent, perArtist) {
  const recentIds = new Set(recent.map((track) => track.videoId).filter(Boolean));
  const uniqueArtists = [...new Map(
    recent
      .map((track) => String(track.artist || '').trim())
      .filter(Boolean)
      .map((artist) => [artist.toLowerCase(), artist])
  ).values()];

  if (uniqueArtists.length === 0) {
    return [];
  }

  const searchResults = await Promise.allSettled(
    uniqueArtists.map((artist) => getArtistCandidates(artist, perArtist))
  );

  const seenIds = new Set(recentIds);
  const tracks = [];

  for (const result of searchResults) {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) {
      continue;
    }

    for (const track of result.value) {
      if (!track.videoId || seenIds.has(track.videoId)) {
        continue;
      }

      seenIds.add(track.videoId);
      tracks.push(track);
    }
  }

  return tracks;
}

function getTrendingSongSection(sections) {
  if (!Array.isArray(sections)) {
    return null;
  }

  return sections.find((section) => section.contents?.some((item) => item.videoId));
}

async function getTrendingTracks(limit = 12) {
  const cached = trendingCache.get('trending');
  const sections = cached || await getHomeSections();

  if (!cached) {
    trendingCache.set('trending', sections);
  }

  const section = getTrendingSongSection(sections);
  if (!section) {
    return [];
  }

  return section.contents
    .filter((item) => item.videoId)
    .map(normalizeTrack)
    .filter((track) => track.videoId)
    .slice(0, limit);
}

async function getRecommendations(recentSongs, { limit = 12, perArtist = 3 } = {}) {
  const recent = Array.isArray(recentSongs) ? recentSongs.slice(0, 10) : [];
  if (recent.length === 0) {
    return getTrendingTracks(limit);
  }

  const poolCacheKey = makePoolCacheKey(recent, perArtist);
  let tracks = recommendationPoolCache.get(poolCacheKey);

  if (!tracks) {
    tracks = await buildRecommendationPool(recent, perArtist);
    recommendationPoolCache.set(poolCacheKey, tracks);
  }

  if (tracks.length === 0) {
    return getTrendingTracks(limit);
  }

  return shuffle(tracks).slice(0, limit);
}

module.exports = { getRecommendations, getTrendingTracks, normalizeTrack };
