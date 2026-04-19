const { searchSongs } = require('../../services/ytmusic');
const { getJson, setJson } = require('./redisCache');
const { sanitizeMatchedSong, sanitizeSourceTrack } = require('./storage');

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const left = normalizeString(a);
  const right = normalizeString(b);

  if (!left) return right.length;
  if (!right) return left.length;

  const previous = new Array(right.length + 1).fill(0).map((_, index) => index);
  const current = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function levenshteinSimilarity(a, b) {
  const left = normalizeString(a);
  const right = normalizeString(b);
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 1;
  return 1 - (levenshteinDistance(left, right) / maxLength);
}

function cosineSimilarity(a, b) {
  const leftTokens = normalizeString(a).split(' ').filter(Boolean);
  const rightTokens = normalizeString(b).split(' ').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;

  const counts = new Map();

  for (const token of leftTokens) {
    counts.set(token, { left: (counts.get(token)?.left || 0) + 1, right: counts.get(token)?.right || 0 });
  }
  for (const token of rightTokens) {
    counts.set(token, { left: (counts.get(token)?.left || 0), right: (counts.get(token)?.right || 0) + 1 });
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const pair of counts.values()) {
    dot += pair.left * pair.right;
    leftMagnitude += pair.left ** 2;
    rightMagnitude += pair.right ** 2;
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function stringSimilarity(a, b) {
  return Math.max(levenshteinSimilarity(a, b), cosineSimilarity(a, b));
}

function durationSimilarity(leftDuration, rightDuration) {
  const left = Math.max(0, Number(leftDuration) || 0);
  const right = Math.max(0, Number(rightDuration) || 0);

  if (!left || !right) return 0.5;

  const delta = Math.abs(left - right);
  if (delta <= 2) return 1;
  if (delta >= 30) return 0;
  return 1 - (delta / 30);
}

function normalizeCandidate(candidate = {}) {
  return sanitizeMatchedSong({
    videoId: candidate.videoId,
    title: candidate.title || candidate.name,
    artist: candidate.artist?.name || candidate.artist || candidate.artists?.[0]?.name || '',
    thumbnail: candidate.thumbnail || candidate.thumbnails?.[candidate.thumbnails.length - 1]?.url || '',
    durationSeconds: candidate.durationSeconds || candidate.duration || 0,
    album: candidate.album?.name || candidate.album || '',
  });
}

function scoreCandidate(sourceTrack, candidate) {
  const titleMatch = stringSimilarity(sourceTrack.name, candidate.title);
  const artistMatch = stringSimilarity(sourceTrack.artist, candidate.artist);
  const durationMatch = durationSimilarity(sourceTrack.duration, candidate.durationSeconds);
  return {
    titleMatch,
    artistMatch,
    durationMatch,
    score: (titleMatch * 0.5) + (artistMatch * 0.3) + (durationMatch * 0.2),
  };
}

function findBestCandidate(sourceTrack, candidates) {
  const normalizedName = normalizeString(sourceTrack.name);
  const normalizedArtist = normalizeString(sourceTrack.artist);

  for (const candidate of candidates) {
    const candidateName = normalizeString(candidate.title);
    const candidateArtist = normalizeString(candidate.artist);
    if (candidateName && candidateArtist && candidateName === normalizedName && candidateArtist === normalizedArtist) {
      return {
        status: 'matched',
        score: 1,
        youfyTrack: candidate,
      };
    }
  }

  let best = null;
  for (const candidate of candidates) {
    const scored = scoreCandidate(sourceTrack, candidate);
    if (!best || scored.score > best.score) {
      best = {
        ...scored,
        youfyTrack: candidate,
      };
    }
  }

  if (!best || best.score <= 0.75) {
    return {
      status: 'unmatched',
      score: best?.score || 0,
      youfyTrack: null,
    };
  }

  return {
    status: 'matched',
    score: best.score,
    youfyTrack: best.youfyTrack,
  };
}

async function searchCandidates(sourceTrack) {
  const query = `${sourceTrack.name} ${sourceTrack.artist}`.trim();
  if (!query) return [];
  const cacheKey = `playlist-import:search:${normalizeString(query)}`;
  const cached = await getJson(cacheKey);
  if (cached) return cached.map(normalizeCandidate).filter(item => item.videoId);

  const results = await searchSongs(query);
  const normalized = Array.isArray(results)
    ? results.map(normalizeCandidate).filter(item => item.videoId).slice(0, 10)
    : [];

  await setJson(cacheKey, normalized, 900);
  return normalized;
}

async function matchTrack(sourceTrack) {
  const safeSource = sanitizeSourceTrack(sourceTrack);
  const candidates = await searchCandidates(safeSource);
  const result = findBestCandidate(safeSource, candidates);

  return {
    sourceTrack: safeSource,
    status: result.status,
    score: Number(result.score.toFixed(4)),
    youfyTrack: result.youfyTrack,
  };
}

async function matchTracks(tracks, options = {}) {
  const results = [];
  const total = Array.isArray(tracks) ? tracks.length : 0;

  for (const [index, track] of (tracks || []).entries()) {
    const matched = await matchTrack(track);
    results.push({
      index,
      ...matched,
    });

    if (typeof options.onProgress === 'function') {
      await options.onProgress({
        completed: index + 1,
        total,
        percent: total ? Math.round(((index + 1) / total) * 100) : 100,
      });
    }
  }

  return results;
}

module.exports = {
  cosineSimilarity,
  durationSimilarity,
  findBestCandidate,
  levenshteinSimilarity,
  matchTrack,
  matchTracks,
  normalizeCandidate,
  normalizeString,
  scoreCandidate,
  stringSimilarity,
};
