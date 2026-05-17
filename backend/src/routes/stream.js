const { Router } = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { validateVideoId } = require('../middleware/validate');
const r = Router();

r.get('/:videoId', validateVideoId, (req, res) => {
  const { videoId } = req.params;

  const YTDLP_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
  const cookiesEnv = process.env.YT_DLP_COOKIES?.trim();
  const writableCookies = path.join(os.tmpdir(), 'youfy-cookies-writable.txt');

  if (cookiesEnv && fs.existsSync(cookiesEnv) && !fs.existsSync(writableCookies)) {
    try { fs.copyFileSync(cookiesEnv, writableCookies); } catch {}
  }

  const args = [
    '--get-url',
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    '--extractor-args', 'youtube:player_client=ios,android',
    '--no-playlist',
    '--no-warnings',
  ];

  if (fs.existsSync(writableCookies)) {
    args.push('--cookies', writableCookies);
  }

  args.push('--', `https://www.youtube.com/watch?v=${videoId}`);

  execFile(YTDLP_BIN, args, { timeout: 45000 }, (err, stdout, stderr) => {
    const cdnUrl = stdout?.trim().split('\n')[0];

    if (!cdnUrl || !cdnUrl.startsWith('http')) {
      console.error('[stream] yt-dlp failed:', stderr?.trim() || err?.message);
      return res.status(500).json({ error: 'Could not extract stream URL' });
    }

    console.log('[stream] proxying CDN URL for:', videoId);

    const client = cdnUrl.startsWith('https') ? https : http;

    const proxyReq = client.get(cdnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Range': req.headers['range'] || 'bytes=0-',
      }
    }, (ytRes) => {
      res.setHeader('Access-Control-Allow-Origin', 'https://youfy.vercel.app');
      res.setHeader('Content-Type', ytRes.headers['content-type'] || 'audio/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      if (ytRes.headers['content-length']) {
        res.setHeader('Content-Length', ytRes.headers['content-length']);
      }
      if (ytRes.headers['content-range']) {
        res.setHeader('Content-Range', ytRes.headers['content-range']);
      }
      res.status(ytRes.statusCode || 200);
      ytRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[stream] proxy error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Proxy failed' });
    });

    req.on('close', () => proxyReq.destroy());
  });
});

module.exports = r;

