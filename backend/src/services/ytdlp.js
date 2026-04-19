/*
 * Hardened yt-dlp extraction service for YOUFY.
 * Optimized for resilience — uses sequential extraction with smart fallback
 * to maximize success rate despite YouTube's JS challenge requirements.
 *
 * Key design decisions:
 *  - 45s timeout per attempt (YouTube JS challenge solver via Deno takes 8-20s)
 *  - --no-warnings flag prevents stderr warnings from being treated as failures
 *  - Fallback uses tv_embedded client (android_music is dead since ~2026.03)
 *  - stdout-first URL extraction: even if yt-dlp exits with code 1, we check
 *    stdout for a valid URL before treating it as a failure
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

const CACHE_TTL_MS = 5 * 60 * 60 * 1000;

// 45s — YouTube's JS challenge solver (Deno) routinely takes 10-25s.
// 15s was killing most extractions before they could finish.
const YT_DLP_TIMEOUT_MS = 45 * 1000;

const streamCache = new Map();
const inflightExtractions = new Map();
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

function buildYtDlpArgs(videoId, extraArgs = []) {
  // Defense-in-depth: re-validate even though middleware already checked
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error('Invalid video ID');
  }

  const args = [
    '-f', '140/bestaudio[ext=m4a]/bestaudio/best',
    '--get-url',
    '--no-playlist',
    '--no-warnings',  // Prevent non-fatal warnings from polluting stderr
    ...resolveCookieArgs(),
    ...extraArgs,
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

/**
 * Extracts a valid URL from yt-dlp stdout.
 * yt-dlp sometimes exits with code 1 even on success (due to non-fatal warnings),
 * so we always check stdout for a valid URL before treating the exit as a failure.
 */
function extractUrlFromOutput(stdout) {
  if (!stdout) return null;

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Find lines that are actual URLs (start with http)
  const urlLines = lines.filter((line) => line.startsWith('http'));
  if (!urlLines.length) return null;

  // Prefer the last URL (yt-dlp prints the audio URL last when multiple formats exist)
  return urlLines[urlLines.length - 1];
}

function validateStreamUrl(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, reason: 'untrusted protocol' };
    }
    const isTrusted = TRUSTED_STREAM_DOMAINS.some(
      (domain) => parsed.hostname === domain.slice(1) || parsed.hostname.endsWith(domain)
    );
    if (!isTrusted) {
      return { valid: false, reason: 'untrusted domain' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'malformed URL' };
  }
}

async function runYtDlpAttempt(videoId, extraArgs = []) {
  const args = buildYtDlpArgs(videoId, extraArgs);

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout: YT_DLP_TIMEOUT_MS }, (error, stdout, stderr) => {
      // CRITICAL FIX: yt-dlp can exit with code 1 even when it successfully
      // extracts the URL (e.g., due to non-fatal warnings about PO tokens).
      // Always check stdout for a valid URL before treating exit code as failure.
      const streamUrl = extractUrlFromOutput(stdout || '');

      if (streamUrl) {
        const validation = validateStreamUrl(streamUrl);
        if (validation.valid) {
          return resolve({ url: streamUrl, format: 'bestaudio' });
        }
        return reject(new Error(`yt-dlp returned URL with ${validation.reason}`));
      }

      // No valid URL found in stdout — this is a real failure
      if (error) {
        const stderrMessage = stderr?.trim() || '';
        const errorMessage = stderrMessage || error.message || 'yt-dlp failed';
        return reject(new Error(errorMessage));
      }

      return reject(new Error('yt-dlp returned empty output'));
    });
  });
}

/**
 * Classify error to determine if retry/fallback is worthwhile.
 */
function classifyError(message) {
  const normalized = (message || '').toLowerCase();

  if (normalized.includes('sign in to confirm') ||
      normalized.includes('429') ||
      normalized.includes('too many requests')) {
    return 'BOT_BLOCK';
  }
  if (normalized.includes('timed out') ||
      normalized.includes('killed') ||
      normalized.includes('etimedout')) {
    return 'TIMEOUT';
  }
  if (normalized.includes('unavailable') ||
      normalized.includes('private video') ||
      normalized.includes('removed')) {
    return 'VIDEO_UNAVAILABLE';
  }
  return 'UNKNOWN';
}

async function runYtDlp(videoId) {
  const startedAt = Date.now();

  try {
    // Primary attempt: use iOS and Android clients (significantly faster, ~9s vs 20s for web clients)
    const extracted = await runYtDlpAttempt(videoId, [
      '--extractor-args',
      'youtube:player_client=ios,android',
    ]);
    logExtraction({ videoId, success: true, failure: null, timeTakenMs: Date.now() - startedAt });
    return extracted;
  } catch (primaryError) {
    const errorType = classifyError(primaryError.message);

    // Don't waste time on fallback if the video itself is unavailable
    if (errorType === 'VIDEO_UNAVAILABLE') {
      logExtraction({ videoId, success: false, failure: primaryError.message, errorType, timeTakenMs: Date.now() - startedAt });
      throw new Error(primaryError.message);
    }

    if (errorType === 'BOT_BLOCK') {
      logExtraction({ videoId, success: false, failure: primaryError.message, errorType, timeTakenMs: Date.now() - startedAt });
      throw new Error('YOUTUBE_BOT_BLOCK: Please refresh cookies.txt');
    }

    // Fallback: try with tv_embedded client (lighter weight, different code path)
    // android_music is dead since ~2026.03 — do NOT use it
    console.warn(`[YOUFY STREAM] Primary extraction failed (${errorType}), retrying with tv_embedded client:`, primaryError.message);

    try {
      const extracted = await runYtDlpAttempt(videoId, [
        '--extractor-args',
        'youtube:player_client=tv_embedded,web',
      ]);
      logExtraction({
        videoId,
        success: true,
        failure: null,
        fallbackUsed: 'tv_embedded',
        timeTakenMs: Date.now() - startedAt,
      });
      return extracted;
    } catch (fallbackError) {
      const errorMessage = fallbackError.message || primaryError.message || 'yt-dlp failed';

      logExtraction({ videoId, success: false, failure: errorMessage, timeTakenMs: Date.now() - startedAt });

      const fallbackType = classifyError(errorMessage);
      if (fallbackType === 'BOT_BLOCK') {
        throw new Error('YOUTUBE_BOT_BLOCK: Please refresh cookies.txt');
      }

      throw new Error(errorMessage);
    }
  }
}

/**
 * Returns stream metadata for a YouTube video, using a 5-hour in-memory cache.
 */
async function getStreamInfo(videoId) {
  const cached = getCacheEntry(videoId);
  if (cached) {
    logExtraction({ videoId, cacheStatus: 'hit', success: true, timeTakenMs: 0 });
    return { url: cached.url, format: cached.format, cacheStatus: 'hit' };
  }

  if (inflightExtractions.has(videoId)) {
    return inflightExtractions.get(videoId);
  }

  // extract fresh, no loops, no innertube
  const extraction = runYtDlp(videoId)
    .then((extracted) => {
      setCacheEntry(videoId, extracted);
      return { ...extracted, cacheStatus: 'miss' };
    })
    .finally(() => {
      inflightExtractions.delete(videoId);
    });

  inflightExtractions.set(videoId, extraction);
  const extracted = await extraction;
  return extracted;
}

/**
 * Returns a playable stream URL for a YouTube video.
 */
async function getStreamUrl(videoId) {
  const stream = await getStreamInfo(videoId);
  return stream.url;
}

module.exports = { getStreamInfo, getStreamUrl };
