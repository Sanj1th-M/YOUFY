const { Router } = require('express');
const { searchSongs, searchAlbums, searchArtists } = require('../services/ytmusic');
const { searchCache } = require('../services/cache');
const { validateSearchQuery } = require('../middleware/validate');
const r = Router();

r.get('/', validateSearchQuery, async (req, res) => {
  const { q } = req.query;
  const cacheKey = `search:${q.toLowerCase()}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const [songs, albums, artists] = await Promise.all([
      searchSongs(q), searchAlbums(q), searchArtists(q),
    ]);
    const result = { songs, albums, artists };
    searchCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[search] failed:', err.message);
    res.status(500).json({ error: 'Search failed. Try again.' });
  }
});

module.exports = r;
