const { Router } = require('express');
const { attachUserIfPresent } = require('../middleware/auth');
const firestore = require('../services/firestore');
const { getRecommendations } = require('../services/recommendations');
const { sanitizeString } = require('../middleware/validate');

const r = Router();

function parseRecentSongsHeader(value) {
  if (!value) {
    return [];
  }

  try {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.slice(0, 10).map((track) => ({
      videoId: sanitizeString(track?.videoId || '', 20),
      artist: sanitizeString(track?.artist || '', 200),
    })).filter((track) => track.videoId || track.artist);
  } catch {
    return [];
  }
}

r.get('/', attachUserIfPresent, async (req, res) => {
  try {
    let recentSongs = [];

    if (req.user?.uid) {
      try {
        recentSongs = await firestore.getRecentlyPlayed(req.user.uid, 10);
      } catch (err) {
        console.error('[recommendations] recent history read failed:', err.message);
      }
    }

    if (recentSongs.length === 0) {
      recentSongs = parseRecentSongsHeader(req.headers['x-recent-songs']);
    }

    const tracks = await getRecommendations(recentSongs, { limit: 12, perArtist: 3 });
    res.json({ tracks });
  } catch (err) {
    console.error('[recommendations] failed:', err.message);
    res.status(500).json({ error: 'Could not load recommendations.' });
  }
});

module.exports = r;
