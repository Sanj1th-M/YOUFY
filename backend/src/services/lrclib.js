const axios = require('axios');
const { lyricsCache } = require('./cache');

const LRCLIB_BASE_URL = 'https://lrclib.net/api';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_LYRIC_TEXT_LENGTH = 60000;
const MAX_SYNCED_LINES = 1500;
const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;

const lrclib = axios.create({
  baseURL: LRCLIB_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': 'Youfy/1.0 lyrics-cache',
    Accept: 'application/json',
  },
  maxContentLength: 256 * 1024,
});

const inFlightRequests = new Map();

// lrclib.net — free, no API key required
async function getLyrics(title, artist, album = '', durationSeconds = 0, videoId = '') {
  const lookup = normalizeLookup({ title, artist, album, durationSeconds, videoId });
  if (!lookup.title || !lookup.artist) {
    return emptyLyrics('invalid');
  }

  const cacheKey = buildCacheKey(lookup);
  const cached = lyricsCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const request = fetchAndCacheLyrics(cacheKey, lookup)
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

async function fetchAndCacheLyrics(cacheKey, lookup) {
  const result = await fetchLyrics(lookup);

  if (hasLyrics(result)) {
    lyricsCache.set(cacheKey, result);
  } else if (result.status === 'not_found') {
    lyricsCache.set(cacheKey, result, NOT_FOUND_TTL_SECONDS);
  }

  return result;
}

async function fetchLyrics(lookup) {
  const queries = buildQueries(lookup);
  let lastProviderError = null;

  for (const query of queries) {
    try {
      const searchResult = await searchLyrics(query);
      if (hasLyrics(searchResult)) {
        return searchResult;
      }
    } catch (err) {
      lastProviderError = err;
    }
  }

  for (const query of queries.slice(0, 2)) {
    try {
      const exact = await getExactLyrics(query);
      if (hasLyrics(exact)) {
        return exact;
      }
    } catch (err) {
      lastProviderError = err;
    }
  }

  if (lastProviderError) {
    throw lastProviderError;
  }

  return emptyLyrics('not_found');
}

async function getExactLyrics(query) {
  try {
    const response = await lrclib.get('/get', { params: buildParams(query) });
    return formatLyrics(response.data, 'exact');
  } catch (err) {
    if (err?.response?.status === 404) {
      return emptyLyrics('not_found');
    }
    throw err;
  }
}

async function searchLyrics(query) {
  const response = await lrclib.get('/search', { params: buildParams(query) });
  const results = Array.isArray(response.data) ? response.data : [];
  const best = findBestMatch(results, query);
  return best ? formatLyrics(best, 'search') : emptyLyrics('not_found');
}

function buildParams(query) {
  const params = {
    track_name: query.title,
    artist_name: query.artist,
  };

  if (query.album) {
    params.album_name = query.album;
  }

  if (query.durationSeconds > 0) {
    params.duration = query.durationSeconds;
  }

  return params;
}

function buildQueries(lookup) {
  const variants = [
    lookup,
    { ...lookup, title: cleanTitle(lookup.title) },
    { ...lookup, title: removeFeaturedArtists(cleanTitle(lookup.title)) },
    { ...lookup, title: cleanTitle(lookup.title), album: '' },
  ];

  const seen = new Set();
  return variants.filter((query) => {
    const key = `${query.title.toLowerCase()}|${query.artist.toLowerCase()}|${query.album.toLowerCase()}`;
    if (!query.title || !query.artist || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function findBestMatch(results, query) {
  const scored = results
    .filter(hasRawLyrics)
    .map((item) => ({ item, score: scoreMatch(item, query) }))
    .filter((entry) => entry.score >= 70)
    .sort((left, right) => right.score - left.score);

  return scored.length ? scored[0].item : null;
}

function scoreMatch(item, query) {
  const itemTitle = normalizeComparable(item.trackName || item.name);
  const itemArtist = normalizeComparable(item.artistName);
  const queryTitle = normalizeComparable(query.title);
  const queryArtist = normalizeComparable(query.artist);
  let score = 0;

  if (itemTitle === queryTitle) {
    score += 55;
  } else if (itemTitle.includes(queryTitle) || queryTitle.includes(itemTitle)) {
    score += 40;
  }

  if (itemArtist === queryArtist) {
    score += 30;
  } else if (itemArtist.includes(queryArtist) || queryArtist.includes(itemArtist)) {
    score += 20;
  }

  const resultDuration = Number(item.duration);
  if (query.durationSeconds > 0 && Number.isFinite(resultDuration)) {
    const delta = Math.abs(resultDuration - query.durationSeconds);
    if (delta <= 3) score += 15;
    else if (delta <= 8) score += 8;
  }

  if (item.syncedLyrics) score += 5;

  return score;
}

function formatLyrics(data, source) {
  if (!data || data.instrumental) {
    return emptyLyrics('not_found');
  }

  const plain = clampLyricsText(data.plainLyrics || '');
  const synced = parseLrc(data.syncedLyrics || '');

  if (!plain && synced.length === 0) {
    return emptyLyrics('not_found');
  }

  return {
    synced,
    plain,
    source,
    status: 'found',
  };
}

function parseLrc(lrc) {
  if (!lrc || typeof lrc !== 'string') return [];

  return lrc
    .slice(0, MAX_LYRIC_TEXT_LENGTH)
    .split('\n')
    .slice(0, MAX_SYNCED_LINES)
    .map(parseLrcLine)
    .filter(Boolean);
}

function parseLrcLine(line) {
  if (typeof line !== 'string' || line[0] !== '[') return null;
  const closeIndex = line.indexOf(']');
  if (closeIndex <= 1) return null;

  const timestamp = line.slice(1, closeIndex);
  const colonIndex = timestamp.indexOf(':');
  if (colonIndex <= 0) return null;

  const minutes = Number.parseInt(timestamp.slice(0, colonIndex), 10);
  const seconds = Number.parseFloat(timestamp.slice(colonIndex + 1));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

  return {
    time: (minutes * 60) + seconds,
    text: clampLineText(line.slice(closeIndex + 1)),
  };
}

function normalizeLookup({ title, artist, album, durationSeconds, videoId }) {
  return {
    title: normalizeSpaces(title),
    artist: normalizeSpaces(artist),
    album: normalizeSpaces(album),
    durationSeconds: normalizeDuration(durationSeconds),
    videoId: normalizeSpaces(videoId),
  };
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(24 * 60 * 60, Math.floor(duration));
}

function buildCacheKey(lookup) {
  const stableId = /^[A-Za-z0-9_-]{11}$/.test(lookup.videoId) ? lookup.videoId : '';
  if (stableId) {
    return `lyrics:video:${stableId}`;
  }

  return [
    'lyrics:meta',
    normalizeComparable(lookup.title),
    normalizeComparable(lookup.artist),
    normalizeComparable(lookup.album),
    lookup.durationSeconds,
  ].join(':');
}

function cleanTitle(title) {
  const withoutTaggedLabels = removeTaggedMediaLabels(normalizeSpaces(title));
  const withoutDashLabel = removeTrailingMediaLabel(withoutTaggedLabels, ' - ');
  return normalizeSpaces(removeTrailingMediaLabel(withoutDashLabel, ' | '));
}

function removeFeaturedArtists(title) {
  const padded = ` ${String(title || '').toLowerCase()} `;
  const markers = [' feat ', ' feat. ', ' ft ', ' ft. ', ' featuring ', ' with '];
  const indexes = markers
    .map((marker) => padded.indexOf(marker))
    .filter((index) => index > 0);

  if (indexes.length === 0) {
    return normalizeSpaces(title);
  }

  return normalizeSpaces(String(title || '').slice(0, Math.min(...indexes) - 1));
}

function removeTaggedMediaLabels(title) {
  let result = '';
  let index = 0;

  while (index < title.length) {
    const char = title.charAt(index);
    const closeChar = char === '(' ? ')' : char === '[' ? ']' : '';
    if (!closeChar) {
      result += char;
      index += 1;
      continue;
    }

    const closeIndex = title.indexOf(closeChar, index + 1);
    if (closeIndex === -1) {
      result += char;
      index += 1;
      continue;
    }

    const content = title.slice(index + 1, closeIndex);
    if (!isMediaLabel(content)) {
      result += title.slice(index, closeIndex + 1);
    }
    index = closeIndex + 1;
  }

  return result;
}

function removeTrailingMediaLabel(title, separator) {
  const index = title.toLowerCase().lastIndexOf(separator);
  if (index === -1) return title;

  const suffix = title.slice(index + separator.length);
  return isMediaLabel(suffix) ? title.slice(0, index) : title;
}

function isMediaLabel(value) {
  let label = normalizeComparable(value);
  if (label.startsWith('official ')) {
    label = label.slice('official '.length);
  }

  return [
    'music video',
    'video',
    'audio',
    'lyric',
    'lyrics',
    'visualizer',
    'hd',
    '4k',
  ].includes(label);
}

function normalizeComparable(value) {
  return normalizeSpaces(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase();
}

function clampLyricsText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_LYRIC_TEXT_LENGTH)
    .trim();
}

function clampLineText(value) {
  return String(value || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 500)
    .trim();
}

function hasRawLyrics(item) {
  return Boolean(item && !item.instrumental && (item.syncedLyrics || item.plainLyrics));
}

function hasLyrics(result) {
  return Boolean(result && (result.plain || (Array.isArray(result.synced) && result.synced.length > 0)));
}

function emptyLyrics(status = 'not_found') {
  return { synced: [], plain: '', source: null, status };
}

module.exports = {
  getLyrics,
  parseLrc,
  cleanTitle,
  findBestMatch,
  scoreMatch,
};
