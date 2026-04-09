const { Router } = require('express');
const firestore = require('../services/firestore');
const { validatePlaylistBody } = require('../middleware/validate');

const r = Router();

r.post('/', validatePlaylistBody, async (req, res) => {
  if (!req.user?.uid || !req.body?.videoId) {
    return res.status(204).end();
  }

  try {
    await firestore.addRecentlyPlayed(req.user.uid, req.body);
    res.status(204).end();
  } catch (err) {
    console.error('[recently-played] add:', err.message);
    res.status(500).json({ error: 'Failed to save recently played song.' });
  }
});

module.exports = r;
