const { Router } = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateVideoId } = require('../middleware/validate');
const r = Router();

// validateVideoId ensures videoId is exactly 11 safe chars before yt-dlp sees it
r.get('/:videoId', validateVideoId, (req, res) => {
  const { videoId } = req.params;

  try {
    const YTDLP_BIN = require.resolve('youtube-dl-exec/bin/yt-dlp');
    
    const cookiesEnv = process.env.YT_DLP_COOKIES?.trim();
    const writableCookies = path.join(os.tmpdir(), 'youfy-cookies-writable.txt');
    if (cookiesEnv && fs.existsSync(cookiesEnv) && !fs.existsSync(writableCookies)) {
      fs.copyFileSync(cookiesEnv, writableCookies);
    }

    const args = [
      '-f', '140/bestaudio[ext=m4a]/bestaudio/best',
      '--extractor-args', 'youtube:player_client=ios,android',
      '--no-playlist',
      '--no-warnings',
      '-o', '-',
    ];
    if (fs.existsSync(writableCookies)) {
      args.push('--cookies', writableCookies);
    }
    args.push('--', `https://www.youtube.com/watch?v=${videoId}`);

    const proc = execFile(YTDLP_BIN, args);

    let headersSent = false;

    proc.stdout.once('data', () => {
      if (!headersSent) {
        headersSent = true;
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Transfer-Encoding', 'chunked');
      }
    });

    proc.stdout.pipe(res);

    proc.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString()));

    proc.on('error', (err) => {
      console.error('[stream] error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
    });

    proc.on('close', (code) => {
      if (code !== 0) console.warn('[stream] yt-dlp exited with code:', code);
    });

    req.on('close', () => {
      setTimeout(() => proc.kill(), 2000);
    });
  } catch (err) {
    console.error('[stream] error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not load stream. Try again.' });
    }
  }
});

module.exports = r;

