const { Router } = require('express');
const { getHomeSections } = require('../services/ytmusic');
const { trendingCache } = require('../services/cache');
const r = Router();

r.get('/', async (req, res) => {
  const cached = trendingCache.get('trending');
  if (cached) return res.json({ sections: cached });

  try {
    const sections = await getHomeSections();
    trendingCache.set('trending', sections);
    res.json({ sections });
  } catch (err) {
    console.error('[trending] failed:', err.message);
    res.status(500).json({ error: 'Could not load trending.' });
  }
});

module.exports = r;
