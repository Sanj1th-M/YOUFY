/*
 * Hardened yt-dlp extraction service for YOUFY.
 * Optimized for fail-fast behavior and minimal format overhead.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// YouTube video IDs are always exactly 11 alphanumeric chars + - _
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Trusted domains that yt-dlp may return streaming URLs from
const TRUSTED_STREAM_DOMAINS = [
  '.googlevideo.com',
  '.youtube.com',
  '.ytimg.com',
  '.googleusercontent.com',
];

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const YT_DLP_TIMEOUT_MS = 15 * 1000; // 15 seconds max

const streamCache = new Map();
let hasWarnedAboutMissingCookies = false;
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function logExtraction(details) {
  console.log('[YOUFY STREAM]', JSON.stringify(details));
}

function getCacheEntry(videoId) {
  const cached = streamCache.get(videoId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    streamCache.delete(videoId);
    return null;
  }
  return cached;
}

function setCacheEntry(videoId, data) {
  streamCache.set(videoId, {
    ...data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function resolveFilePath(filePath) {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  const cwdCandidate = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  return path.resolve(BACKEND_ROOT, filePath);
}

function resolveCookieArgs() {
  const args = [];
  const cookiesPath = process.env.YT_DLP_COOKIES?.trim();
  const cookiesFromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();
  const resolvedCookiesPath = resolveFilePath(cookiesPath);

  if (cookiesPath) {
    if (resolvedCookiesPath && fs.existsSync(resolvedCookiesPath)) {
      args.push('--cookies', resolvedCookiesPath);
    } else {
      console.warn(`[YOUFY STREAM] cookies file not found: ${cookiesPath}`);
    }
  }

  if (cookiesFromBrowser) {
    args.push('--cookies-from-browser', cookiesFromBrowser);
  }

  if (!cookiesPath && !cookiesFromBrowser && !hasWarnedAboutMissingCookies) {
    console.warn('[YOUFY STREAM] No yt-dlp cookies configured. Extraction will run without cookies.');
    hasWarnedAboutMissingCookies = true;
  }

  return args;
}

function buildYtDlpArgs(videoId) {
  // Defense-in-depth: re-validate even though middleware already checked
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error('Invalid video ID');
  }

  const args = [
    '-f', '140/bestaudio[ext=m4a]/bestaudio/best',
    '--get-url',
    '--no-playlist',
    ...resolveCookieArgs(),
  ];

  const proxy = process.env.YT_DLP_PROXY?.trim();
  if (proxy) {
    // Strict proxy format: protocol://host:port only
    const PROXY_REGEX = /^(socks5|http|https):\/\/[a-zA-Z0-9._-]+:\d{1,5}$/;
    if (!PROXY_REGEX.test(proxy)) {
      throw new Error('Invalid proxy format. Expected: protocol://host:port');
    }
    args.push('--proxy', proxy);
  }

  // '--' stops yt-dlp from interpreting further args as flags
  args.push('--', `https://www.youtube.com/watch?v=${videoId}`);
  return args;
}

async function runYtDlp(videoId) {
  const args = buildYtDlpArgs(videoId);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout: YT_DLP_TIMEOUT_MS }, (error, stdout, stderr) => {
      const timeTakenMs = Date.now() - startedAt;
      
      if (error) {
        const stderrMessage = stderr?.trim() || '';
        const errorMessage = stderrMessage || error.message || 'yt-dlp failed';
        
        logExtraction({ videoId, success: false, failure: errorMessage, timeTakenMs });

        // Fail fast if it's a known bot/rate-limit error
        const normalized = errorMessage.toLowerCase();
        if (normalized.includes('sign in to confirm') || 
            normalized.includes('429') || 
            normalized.includes('too many requests')) {
          return reject(new Error('YOUTUBE_BOT_BLOCK: Please refresh cookies.txt'));
        }
        
        return reject(new Error(errorMessage));
      }

      const urls = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!urls.length) {
        logExtraction({ videoId, success: false, failure: 'empty URL returned', timeTakenMs });
        return reject(new Error('yt-dlp returned empty URL'));
      }

      const streamUrl = urls.length > 1 ? urls[urls.length - 1] : urls[0];

      // Validate returned URL points to a trusted domain
      try {
        const parsed = new URL(streamUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          logExtraction({ videoId, success: false, failure: 'untrusted URL protocol', timeTakenMs });
          return reject(new Error('yt-dlp returned URL with untrusted protocol'));
        }
        const isTrusted = TRUSTED_STREAM_DOMAINS.some(
          (domain) => parsed.hostname === domain.slice(1) || parsed.hostname.endsWith(domain)
        );
        if (!isTrusted) {
          logExtraction({ videoId, success: false, failure: `untrusted domain: ${parsed.hostname}`, timeTakenMs });
          return reject(new Error('yt-dlp returned URL from untrusted domain'));
        }
      } catch {
        logExtraction({ videoId, success: false, failure: 'malformed URL from yt-dlp', timeTakenMs });
        return reject(new Error('yt-dlp returned malformed URL'));
      }

      logExtraction({ videoId, success: true, failure: null, timeTakenMs });

      resolve({
        url: streamUrl,
        format: 'bestaudio',
      });
    });
  });
}

/**
 * Returns stream metadata for a YouTube video, using a 2-hour in-memory cache.
 */
async function getStreamInfo(videoId) {
  const cached = getCacheEntry(videoId);
  if (cached) {
    logExtraction({ videoId, cacheStatus: 'hit', success: true, timeTakenMs: 0 });
    return { url: cached.url, format: cached.format, cacheStatus: 'hit' };
  }

  // extract fresh, no loops, no innertube
  const extracted = await runYtDlp(videoId);
  setCacheEntry(videoId, extracted);
  return { ...extracted, cacheStatus: 'miss' };
}

/**
 * Returns a playable stream URL for a YouTube video.
 */
async function getStreamUrl(videoId) {
  const stream = await getStreamInfo(videoId);
  return stream.url;
}

module.exports = { getStreamInfo, getStreamUrl };
