const { Router } = require('express');
const youtubedl = require('youtube-dl-exec');
const os = require('os');
const fs = require('fs');
const { validateVideoId } = require('../middleware/validate');
const r = Router();

// validateVideoId ensures videoId is exactly 11 safe chars before yt-dlp sees it
r.get('/:videoId', validateVideoId, (req, res) => {
  const { videoId } = req.params;

  try {
    const cookiesPath = process.env.YT_DLP_COOKIES;
    let writableCookiesPath = null;
    let cookieArgs = false;

    if (cookiesPath && fs.existsSync(cookiesPath)) {
      writableCookiesPath = os.tmpdir() + '/youfy-cookies-writable.txt';
      fs.copyFileSync(cookiesPath, writableCookiesPath);
      cookieArgs = true;
    }

    const proc = youtubedl.raw(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        format: '140/bestaudio[ext=m4a]/bestaudio/best',
        extractorArgs: 'youtube:player_client=ios,android',
        noPlaylist: true,
        noWarnings: true,
        output: '-',
        ...(cookieArgs ? { cookies: writableCookiesPath } : {})
      }
    );

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
      console.error('[stream] yt-dlp error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[stream] yt-dlp exited with code ${code}`);
        if (!headersSent && !res.headersSent) {
          res.status(500).json({ error: 'Could not load stream. Try again.' });
        }
      }
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

