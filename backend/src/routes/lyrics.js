const { Router } = require('express');
const { getLyrics } = require('../services/lrclib');
const { sanitizeString } = require('../middleware/validate');
const r = Router();

r.get('/', async (req, res) => {
  const title  = sanitizeString(req.query.title  || '', 200);
  const artist = sanitizeString(req.query.artist || '', 200);
  const album  = sanitizeString(req.query.album  || '', 200);
  const videoId = sanitizeString(req.query.videoId || '', 20);
  const durationSeconds = Math.max(0, Math.floor(Number(req.query.durationSeconds || req.query.duration) || 0));

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing params: title and artist required' });
  }

  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID format' });
  }

  try {
    const result = await getLyrics(title, artist, album, durationSeconds, videoId);
    res.json(result);
  } catch (err) {
    console.error('[lyrics] failed:', err.message);
    res.status(503).json({ error: 'Lyrics provider is unavailable. Try again.' });
  }
});

module.exports = r;
