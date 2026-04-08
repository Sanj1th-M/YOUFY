const { Router } = require('express');
const { getLyrics } = require('../services/lrclib');
const { sanitizeString } = require('../middleware/validate');
const r = Router();

r.get('/', async (req, res) => {
  const title  = sanitizeString(req.query.title  || '', 200);
  const artist = sanitizeString(req.query.artist || '', 200);
  const album  = sanitizeString(req.query.album  || '', 200);
  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing params: title and artist required' });
  }
  try {
    const result = await getLyrics(title, artist, album);
    res.json(result);
  } catch (err) {
    console.error('[lyrics] failed:', err.message);
    res.status(500).json({ error: 'Could not load lyrics.' });
  }
});

module.exports = r;
