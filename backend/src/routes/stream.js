const { Router } = require('express');
const { execFile } = require('child_process');
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
    
    const ytDlpArgs = [
      '-f', '140/bestaudio[ext=m4a]/bestaudio/best',
      '--extractor-args', 'youtube:player_client=ios,android',
      '--no-playlist',
      '--no-warnings',
      '-o', '-',
    ];

    if (cookiesPath && fs.existsSync(cookiesPath)) {
      writableCookiesPath = os.tmpdir() + '/youfy-cookies-writable.txt';
      fs.copyFileSync(cookiesPath, writableCookiesPath);
      ytDlpArgs.push('--cookies', writableCookiesPath);
    }

    ytDlpArgs.push('--', `https://www.youtube.com/watch?v=${videoId}`);

    const proc = execFile('yt-dlp', ytDlpArgs);

    let stderrData = '';
    let headersSent = false;

    proc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    proc.stdout.once('data', () => {
      if (!headersSent) {
        headersSent = true;
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Transfer-Encoding', 'chunked');
      }
    });

    proc.stdout.pipe(res);

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[stream] yt-dlp exited with code ${code}:`, stderrData.slice(0, 500));
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
