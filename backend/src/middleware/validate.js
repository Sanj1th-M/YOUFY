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

function validatePlaylistBody(req, res, next) {
  if (req.body.name) {
    req.body.name = sanitizeString(req.body.name, 100);
  }
  // Only allow known song fields — strip everything else
  if (req.body.videoId || req.body.title) {
    req.body = {
      videoId:         sanitizeString(req.body.videoId || '', 20),
      title:           sanitizeString(req.body.title || '', 200),
      artist:          sanitizeString(req.body.artist || '', 200),
      thumbnail:       sanitizeString(req.body.thumbnail || '', 500),
      durationSeconds: parseInt(req.body.durationSeconds) || 0,
      album:           sanitizeString(req.body.album || '', 200),
    };
  }
  next();
}

module.exports = { validateVideoId, validateSearchQuery, validatePlaylistBody, sanitizeString };
