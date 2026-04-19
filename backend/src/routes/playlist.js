const { Router } = require('express');
const fs = require('../services/firestore');
const { validatePlaylistNameBody, validateSongBody, sanitizeString } = require('../middleware/validate');
const r = Router();

async function assertNotSystemPlaylist(req, res, playlistId) {
  const playlist = await fs.getPlaylist(req.user.uid, playlistId);
  if (!playlist) {
    res.status(404).json({ error: 'Playlist not found.' });
    return false;
  }

  if (playlist.systemKey) {
    res.status(403).json({ error: 'This playlist cannot be modified.' });
    return false;
  }

  return true;
}

r.get('/', async (req, res) => {
  try { res.json({ playlists: await fs.getPlaylists(req.user.uid) }); }
  catch (err) { console.error('[playlist] get:', err.message); res.status(500).json({ error: 'Failed to load playlists.' }); }
});

r.post('/', validatePlaylistNameBody, async (req, res) => {
  const { name } = req.body;
  try { res.status(201).json({ playlist: await fs.createPlaylist(req.user.uid, name) }); }
  catch (err) { console.error('[playlist] create:', err.message); res.status(500).json({ error: 'Failed to create playlist.' }); }
});

r.put('/:id', validatePlaylistNameBody, async (req, res) => {
  const id = sanitizeString(req.params.id, 50);
  // Disallow renaming/updating system playlists (e.g., Liked Songs)
  const ok = await assertNotSystemPlaylist(req, res, id);
  if (!ok) return;
  try { await fs.updatePlaylist(req.user.uid, id, req.body); res.json({ success: true }); }
  catch (err) { console.error('[playlist] update:', err.message); res.status(500).json({ error: 'Failed to update playlist.' }); }
});

r.delete('/:id', async (req, res) => {
  const id = sanitizeString(req.params.id, 50);
  // Disallow deleting system playlists (e.g., Liked Songs)
  const ok = await assertNotSystemPlaylist(req, res, id);
  if (!ok) return;
  try { await fs.deletePlaylist(req.user.uid, id); res.json({ success: true }); }
  catch (err) { console.error('[playlist] delete:', err.message); res.status(500).json({ error: 'Failed to delete playlist.' }); }
});

r.post('/:id/song', validateSongBody, async (req, res) => {
  const id = sanitizeString(req.params.id, 50);
  if (!req.body.videoId) return res.status(400).json({ error: 'Invalid song payload.' });
  try { await fs.addSong(req.user.uid, id, req.body); res.json({ success: true }); }
  catch (err) { console.error('[playlist] addSong:', err.message); res.status(500).json({ error: 'Failed to add song.' }); }
});

r.delete('/:id/song/:videoId', async (req, res) => {
  const id      = sanitizeString(req.params.id, 50);
  const videoId = sanitizeString(req.params.videoId, 20);
  try { await fs.removeSong(req.user.uid, id, videoId); res.json({ success: true }); }
  catch (err) { console.error('[playlist] removeSong:', err.message); res.status(500).json({ error: 'Failed to remove song.' }); }
});

module.exports = r;
