/*
 * Health endpoints for backend uptime and stream pipeline validation.
 * Includes a cooldown-backed stream probe to avoid hammering YouTube.
 */

const { Router } = require('express');
const { getStreamInfo } = require('../services/ytdlp');

const STREAM_TEST_VIDEO_ID = 'dQw4w9WgXcQ';
const STREAM_TEST_COOLDOWN_MS = 60 * 1000;

const router = Router();

let lastStreamCheck = null;

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

router.get('/stream', async (req, res) => {
  if (lastStreamCheck && lastStreamCheck.expiresAt > Date.now()) {
    return res.status(lastStreamCheck.statusCode).json(lastStreamCheck.payload);
  }

  try {
    const stream = await getStreamInfo(STREAM_TEST_VIDEO_ID);
    const payload = {
      status: 'ok',
      playable: true,
      format: stream.format,
    };

    lastStreamCheck = {
      statusCode: 200,
      payload,
      expiresAt: Date.now() + STREAM_TEST_COOLDOWN_MS,
    };

    return res.json(payload);
  } catch (error) {
    const payload = {
      status: 'broken',
      error: error.message,
    };

    lastStreamCheck = {
      statusCode: 500,
      payload,
      expiresAt: Date.now() + STREAM_TEST_COOLDOWN_MS,
    };

    return res.status(500).json(payload);
  }
});

module.exports = router;
