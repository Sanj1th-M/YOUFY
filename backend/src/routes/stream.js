const { Router } = require('express');
const { getStreamUrl } = require('../services/ytdlp');
const { validateVideoId } = require('../middleware/validate');
const r = Router();

// validateVideoId ensures videoId is exactly 11 safe chars before yt-dlp sees it
r.get('/:videoId', validateVideoId, async (req, res) => {
  const { videoId } = req.params;

  try {
    const url = await getStreamUrl(videoId);
    res.json({ url });
  } catch (err) {
    console.error('[stream] extraction failed:', err.message);
    // Generic error to client — no internal details
    res.status(500).json({ error: 'Could not load stream. Try again.' });
  }
});

module.exports = r;
