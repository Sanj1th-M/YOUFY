/*
 * Hardened yt-dlp extraction service for YOUFY.
 * Handles format fallbacks, cookie/proxy support, retries, caching, and logs.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const axios = require('axios');

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 2 * 1000;
const RETRY_ATTEMPTS = 3;
const YT_DLP_TIMEOUT_MS = 30 * 1000;

const streamCache = new Map();
let hasWarnedAboutMissingCookies = false;

const FORMAT_CHAIN = [
  { label: 'bestaudio[ext=webm]/bestaudio[ext=m4a]', selector: 'bestaudio[ext=webm]/bestaudio[ext=m4a]' },
  { label: 'bestaudio', selector: 'bestaudio' },
  { label: '18', selector: '18' },
  { label: 'worst[acodec!=none]', selector: 'worst[acodec!=none]' },
  { label: 'worstvideo+bestaudio', selector: 'worstvideo+bestaudio' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(message) {
  if (!message) {
    return true;
  }

  const normalized = message.toLowerCase();
  const permanentPatterns = [
    'requested format is not available',
    'yt-dlp returned empty url',
    'no audio format found',
    'unsupported url',
    'unsupported error',
  ];

  return !permanentPatterns.some((pattern) => normalized.includes(pattern));
}

function logExtraction(details) {
  console.log('[YOUFY STREAM]', JSON.stringify(details));
}

function getCacheEntry(videoId) {
  const cached = streamCache.get(videoId);
  if (!cached) {
    return null;
  }

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

function resolveCookieArgs() {
  const args = [];
  const cookiesPath = process.env.YT_DLP_COOKIES?.trim();
  const cookiesFromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();

  if (cookiesPath) {
    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath);
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

function buildYtDlpArgs(videoId, formatSelector) {
  const args = [
    '--remote-components', 'ejs:github',
    '--js-runtimes', 'node',
    '--format', formatSelector,
    '--get-url',
    '--no-playlist',
    ...resolveCookieArgs(),
  ];

  const proxy = process.env.YT_DLP_PROXY?.trim();
  if (proxy) {
    args.push('--proxy', proxy);
  }

  args.push(`https://www.youtube.com/watch?v=${videoId}`);
  return args;
}

async function runYtDlp(videoId, format) {
  const args = buildYtDlpArgs(videoId, format.selector);

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout: YT_DLP_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        const stderrMessage = stderr?.trim();
        const message = stderrMessage || error.message || 'yt-dlp failed';
        reject(new Error(message));
        return;
      }

      const urls = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!urls.length) {
        reject(new Error('yt-dlp returned empty URL'));
        return;
      }

      resolve({
        url: urls.length > 1 ? urls[urls.length - 1] : urls[0],
        format: format.label,
      });
    });
  });
}

async function extractWithRetries(videoId, format, cacheStatus) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();

    try {
      const result = await runYtDlp(videoId, format);
      logExtraction({
        videoId,
        format: format.label,
        cacheStatus,
        success: true,
        failure: null,
        attempt,
        timeTakenMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error.message || 'Unknown yt-dlp failure';
      logExtraction({
        videoId,
        format: format.label,
        cacheStatus,
        success: false,
        failure: message,
        attempt,
        timeTakenMs: Date.now() - startedAt,
      });

      if (attempt >= RETRY_ATTEMPTS) {
        throw new Error(message);
      }

      if (!shouldRetry(message)) {
        throw new Error(message);
      }

      console.warn(`[YOUFY STREAM] retrying videoId=${videoId} format=${format.label} attempt=${attempt + 1} reason=${message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw new Error(`Retries exhausted for ${videoId}`);
}

async function extractWithInnertube(videoId, cacheStatus) {
  const startedAt = Date.now();

  try {
    const response = await axios.post(
      'https://www.youtube.com/youtubei/v1/player',
      {
        videoId,
        context: {
          client: { clientName: 'ANDROID', clientVersion: '17.31.35' },
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    const formats = response.data?.streamingData?.adaptiveFormats || [];
    const audio = formats.find((candidate) => candidate.mimeType?.startsWith('audio/'));
    if (!audio?.url) {
      throw new Error('Innertube: no audio format found');
    }

    logExtraction({
      videoId,
      format: 'innertube',
      cacheStatus,
      success: true,
      failure: null,
      attempt: 1,
      timeTakenMs: Date.now() - startedAt,
    });

    return { url: audio.url, format: 'innertube' };
  } catch (error) {
    const message = error.message || 'Innertube failed';
    logExtraction({
      videoId,
      format: 'innertube',
      cacheStatus,
      success: false,
      failure: message,
      attempt: 1,
      timeTakenMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }
}

async function extractFreshStream(videoId, cacheStatus) {
  const failures = [];

  for (const format of FORMAT_CHAIN) {
    try {
      return await extractWithRetries(videoId, format, cacheStatus);
    } catch (error) {
      failures.push(`${format.label}: ${error.message}`);
    }
  }

  try {
    return await extractWithInnertube(videoId, cacheStatus);
  } catch (error) {
    failures.push(`innertube: ${error.message}`);
  }

  throw new Error(failures.join(' | '));
}

/**
 * Returns stream metadata for a YouTube video, using a 4-hour in-memory cache.
 * @param {string} videoId
 * @returns {Promise<{url: string, format: string, cacheStatus: string}>}
 */
async function getStreamInfo(videoId) {
  const cached = getCacheEntry(videoId);
  if (cached) {
    logExtraction({
      videoId,
      format: cached.format,
      cacheStatus: 'hit',
      success: true,
      failure: null,
      attempt: 0,
      timeTakenMs: 0,
    });
    return { url: cached.url, format: cached.format, cacheStatus: 'hit' };
  }

  const extracted = await extractFreshStream(videoId, 'miss');
  setCacheEntry(videoId, extracted);
  return { ...extracted, cacheStatus: 'miss' };
}

/**
 * Returns a playable stream URL for a YouTube video.
 * @param {string} videoId
 * @returns {Promise<string>}
 */
async function getStreamUrl(videoId) {
  const stream = await getStreamInfo(videoId);
  return stream.url;
}

module.exports = { getStreamInfo, getStreamUrl };
