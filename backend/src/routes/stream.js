const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { validateVideoId } = require('../middleware/validate');

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YTDLP_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
const FFMPEG_BIN = require('ffmpeg-static');

const r = Router();

r.get('/:videoId', validateVideoId, (req, res) => {
  const { videoId } = req.params;

  if (!VIDEO_ID_REGEX.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const cookiesEnv = process.env.YT_DLP_COOKIES?.trim();
  const writableCookies = path.join(os.tmpdir(), 'youfy-cookies-writable.txt');

  if (cookiesEnv && fs.existsSync(cookiesEnv) && !fs.existsSync(writableCookies)) {
    try { fs.copyFileSync(cookiesEnv, writableCookies); } catch (e) {
      console.warn('[stream] cookies copy failed:', e.message);
    }
  }

  const args = [
    '-f', 'bestaudio/best',
    '--extractor-args', 'youtube:player_client=ios,android',
    '--no-playlist',
    '--no-warnings',
    '--ffmpeg-location', FFMPEG_BIN,
    '-o', '-',
  ];

  if (fs.existsSync(writableCookies)) {
    args.push('--cookies', writableCookies);
  }

  args.push('--', `https://www.youtube.com/watch?v=${videoId}`);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Access-Control-Allow-Origin', 'https://youfy.vercel.app');

  const proc = spawn(YTDLP_BIN, args);

  proc.stdout.pipe(res);

  proc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString()));

  proc.on('error', (err) => {
    console.error('[stream] spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
  });

  proc.on('close', (code) => {
    if (code !== 0) console.warn('[stream] yt-dlp exited with code:', code);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => setTimeout(() => proc.kill(), 2000));
});

module.exports = r;
