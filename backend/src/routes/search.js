const { Router } = require('express');
const {
  searchSongs,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  getAlbum,
  getArtist,
} = require('../services/ytmusic');
const { searchCache } = require('../services/cache');
const { validateSearchQuery } = require('../middleware/validate');
const r = Router();

r.get('/', validateSearchQuery, async (req, res) => {
  const { q } = req.query;
  const cacheKey = `search:${q.toLowerCase()}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const [songs, albums, artists, playlists] = await Promise.all([
      searchSongs(q),
      searchAlbums(q),
      searchArtists(q),
      searchPlaylists(q).catch(() => []),
    ]);
    const result = { songs, albums, artists, playlists };
    searchCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[search] failed:', err.message);
    res.status(500).json({ error: 'Search failed. Try again.' });
  }
});

// GET /search/album/:browseId — album info + full track list
r.get('/album/:browseId', async (req, res) => {
  const { browseId } = req.params;

  if (!browseId || !/^[A-Za-z0-9_-]+$/.test(browseId) || browseId.length > 100) {
    return res.status(400).json({ error: 'Invalid browseId' });
  }

  const cacheKey = `album:${browseId}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const album = await getAlbum(browseId);
    if (!album) {
      return res.status(500).json({ error: 'Could not load album.' });
    }
    searchCache.set(cacheKey, album);
    res.json(album);
  } catch (err) {
    console.error('[search/album] failed:', err.message);
    res.status(500).json({ error: 'Could not load album.' });
  }
});

// GET /search/artist/:artistId — artist info + popular songs
// Falls back to searchSongs(name) when topSongs is empty (varies by region)
r.get('/artist/:artistId', async (req, res) => {
  const { artistId } = req.params;

  if (!artistId || !/^[A-Za-z0-9_-]+$/.test(artistId) || artistId.length > 100) {
    return res.status(400).json({ error: 'Invalid artistId' });
  }

  const cacheKey = `artist:${artistId}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const artist = await getArtist(artistId);
    if (!artist) {
      return res.status(500).json({ error: 'Could not load artist.' });
    }

    // ytmusic-api returns topSongs, topAlbums, topSingles (direct arrays)
    // When topSongs is empty, fall back to searchSongs(artistName)
    if (
      Array.isArray(artist.topSongs) &&
      artist.topSongs.length === 0 &&
      artist.name
    ) {
      try {
        const fallbackSongs = await searchSongs(artist.name);
        if (Array.isArray(fallbackSongs) && fallbackSongs.length > 0) {
          artist.topSongs = fallbackSongs.slice(0, 20);
        }
      } catch {
        // Non-critical — artist page still shows albums/singles
      }
    }

    searchCache.set(cacheKey, artist);
    res.json(artist);
  } catch (err) {
    console.error('[search/artist] failed:', err.message);
    res.status(500).json({ error: 'Could not load artist.' });
  }
});

module.exports = r;
