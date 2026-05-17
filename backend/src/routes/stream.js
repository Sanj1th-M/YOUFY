const { Router } = require('express');
const https = require('https');
const http = require('http');
const { validateVideoId } = require('../middleware/validate');
const { getStreamUrl } = require('../services/ytdlp');

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const r = Router();

r.get('/:videoId', validateVideoId, async (req, res) => {
  const { videoId } = req.params;

  if (!VIDEO_ID_REGEX.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const url = await getStreamUrl(videoId);
    if (!url) {
      return res.status(500).json({ error: 'Failed to extract stream URL' });
    }

    const client = url.startsWith('https') ? https : http;
    
    const proxyReq = client.get(url, (proxyRes) => {
      // YouTube sometimes returns 403 if it detects a proxy, but we are coming from the same IP.
      res.status(proxyRes.statusCode);
      
      // Forward relevant headers from YouTube CDN
      const headersToForward = [
        'content-type',
        'content-length',
        'accept-ranges',
        'content-range'
      ];
      
      headersToForward.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });
      
      // Fallback content type if YouTube doesn't provide it
      if (!proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', 'audio/mp4');
      }

      // Ensure CORS so frontend can play it
      res.setHeader('Access-Control-Allow-Origin', 'https://youfy.vercel.app');

      // Pipe the CDN bytes directly to the client
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[stream] Proxy request error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream fetch failed' });
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });

  } catch (err) {
    console.error('[stream] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = r;
