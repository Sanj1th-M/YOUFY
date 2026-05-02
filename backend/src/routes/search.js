const { Router } = require('express');
const {
  searchSongs,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  getAlbum,
  getArtist,
  getPlaylist,
  getPlaylistVideos,
} = require('../services/ytmusic');
const { searchCache } = require('../services/cache');
const { validateSearchQuery, sanitizeString } = require('../middleware/validate');
const r = Router();

// ── Response sanitizers — whitelist only safe fields ──────────────

function pickThumbnail(item) {
  // ytmusic-api may return thumbnails as array of {url,width,height} or string
  if (typeof item.thumbnail === 'string') return item.thumbnail;
  if (Array.isArray(item.thumbnails) && item.thumbnails.length) {
    return item.thumbnails[item.thumbnails.length - 1]?.url || '';
  }
  if (typeof item.thumbnail === 'object' && item.thumbnail?.url) return item.thumbnail.url;
  return '';
}

function sanitizeSong(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    videoId:    item.videoId || '',
    name:       item.name || item.title || '',
    artist:     (item.artist && typeof item.artist === 'object' ? item.artist.name : item.artist) || '',
    album:      (item.album && typeof item.album === 'object' ? item.album.name : item.album) || '',
    duration:   item.duration || 0,
    thumbnail:  pickThumbnail(item),
  };
}

function sanitizeAlbum(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    browseId:   item.albumId || item.browseId || '',
    name:       item.name || item.title || '',
    artist:     (item.artist && typeof item.artist === 'object' ? item.artist.name : item.artist) || '',
    year:       item.year || '',
    thumbnail:  pickThumbnail(item),
    type:       item.type || 'album',
  };
}

function sanitizeArtist(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    artistId:   item.artistId || item.browseId || '',
    name:       item.name || '',
    thumbnail:  pickThumbnail(item),
  };
}

function sanitizePlaylistItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    playlistId: item.playlistId || item.browseId || '',
    name:       item.name || item.title || '',
    artist:     (item.artist && typeof item.artist === 'object' ? item.artist.name : item.artist) || '',
    thumbnail:  pickThumbnail(item),
  };
}

function sanitizeArray(arr, fn) {
  return Array.isArray(arr) ? arr.map(fn).filter(Boolean) : [];
}

// YouTube IDs: alphanumeric, 2-64 chars
const YT_ID_REGEX = /^[A-Za-z0-9_-]{2,64}$/;

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

    // Whitelist only safe fields — never expose raw API internals
    const result = {
      songs:     sanitizeArray(songs, sanitizeSong),
      albums:    sanitizeArray(albums, sanitizeAlbum),
      artists:   sanitizeArray(artists, sanitizeArtist),
      playlists: sanitizeArray(playlists, sanitizePlaylistItem),
    };

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

  if (!browseId || !YT_ID_REGEX.test(browseId)) {
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

  if (!artistId || !YT_ID_REGEX.test(artistId)) {
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

// GET /search/playlist/:playlistId — playlist info + all videos/songs
r.get('/playlist/:playlistId', async (req, res) => {
  const { playlistId } = req.params;

  if (!playlistId || !YT_ID_REGEX.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlistId' });
  }

  const cacheKey = `playlist:${playlistId}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // getPlaylist returns metadata (name, artist, thumbnails, videoCount)
    // getPlaylistVideos returns the actual video/track list
    const [playlistMeta, videos] = await Promise.all([
      getPlaylist(playlistId),
      getPlaylistVideos(playlistId),
    ]);

    if (!playlistMeta) {
      return res.status(500).json({ error: 'Could not load playlist.' });
    }

    const result = {
      ...playlistMeta,
      videos: Array.isArray(videos) ? videos : [],
    };

    searchCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[search/playlist] failed:', err.message);
    res.status(500).json({ error: 'Could not load playlist.' });
  }
});

module.exports = r;
