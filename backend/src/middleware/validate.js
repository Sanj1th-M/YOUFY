// Input validation middleware — prevents injection attacks

// YouTube video IDs are always exactly 11 alphanumeric chars + - _
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Sanitize string — remove control chars and limit length
function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\x00-\x1F\x7F]/g, '') // remove control characters
    .slice(0, maxLen)
    .trim();
}

function validateVideoId(req, res, next) {
  const { videoId } = req.params;
  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID format' });
  }
  next();
}

function validateSearchQuery(req, res, next) {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Missing search query' });
  }
  // Sanitize and limit length
  req.query.q = sanitizeString(q, 100);
  if (!req.query.q) {
    return res.status(400).json({ error: 'Invalid search query' });
  }
  next();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validatePlaylistNameBody(req, res, next) {
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }

  const allowedKeys = new Set(['name']);
  const hasUnknownKeys = Object.keys(req.body).some((key) => !allowedKeys.has(key));
  if (hasUnknownKeys) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }

  const name = sanitizeString(req.body.name, 100);
  if (!name) {
    return res.status(400).json({ error: 'Missing: name' });
  }

  req.body = { name };
  next();
}

function validatePlaylistUpdateBody(req, res, next) {
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }

  const allowedKeys = new Set(['name', 'description', 'privacy', 'voting']);
  const hasUnknownKeys = Object.keys(req.body).some((key) => !allowedKeys.has(key));
  if (hasUnknownKeys) {
    return res.status(400).json({ error: 'Invalid playlist payload' });
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const name = sanitizeString(req.body.name, 100);
    if (!name) {
      return res.status(400).json({ error: 'Missing: name' });
    }
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
    updates.description = sanitizeString(req.body.description, 300);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'privacy')) {
    const privacy = sanitizeString(req.body.privacy, 20).toLowerCase();
    if (!['private', 'public', 'unlisted'].includes(privacy)) {
      return res.status(400).json({ error: 'Invalid privacy value' });
    }
    updates.privacy = privacy;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'voting')) {
    const voting = sanitizeString(req.body.voting, 10).toLowerCase();
    if (!['off', 'on'].includes(voting)) {
      return res.status(400).json({ error: 'Invalid voting value' });
    }
    updates.voting = voting;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Missing playlist updates' });
  }

  req.body = updates;
  next();
}

function validateSongBody(req, res, next) {
  const body = isPlainObject(req.body) ? req.body : {};

  // Only allow known song fields. This prevents client-controlled fields from
  // being persisted while preserving existing callers that send larger song objects.
  const videoId = sanitizeString(body.videoId || '', 20);
  req.body = {
    videoId:         VIDEO_ID_REGEX.test(videoId) ? videoId : '',
    title:           sanitizeString(body.title || body.name || '', 200),
    artist:          sanitizeString(body.artist || '', 200),
    thumbnail:       sanitizeString(body.thumbnail || '', 500),
    durationSeconds: parseInt(body.durationSeconds, 10) || 0,
    album:           sanitizeString(body.album || '', 200),
  };
  next();
}

module.exports = {
  validateVideoId,
  validateSearchQuery,
  validatePlaylistNameBody,
  validatePlaylistUpdateBody,
  validateSongBody,
  sanitizeString,
};
