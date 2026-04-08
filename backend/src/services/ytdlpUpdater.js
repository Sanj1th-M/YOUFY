/*
 * Background maintenance jobs for yt-dlp updates and YouTube cookie freshness.
 * Keeps extraction dependencies updated and warns before cookie auth expires.
 */

const fs = require('fs/promises');
const { execFile } = require('child_process');
const cron = require('node-cron');

const COOKIE_WARNING_DAYS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let jobsStarted = false;

function logWithTimestamp(level, message) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] ${message}`);
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr?.trim() || stdout?.trim() || error.message;
        reject(new Error(detail));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function updateYtDlp() {
  try {
    await execFileAsync('pip', ['install', '-U', 'yt-dlp', '--break-system-packages']);
    logWithTimestamp('log', '[YOUFY] yt-dlp auto-update succeeded.');
  } catch (pipError) {
    try {
      await execFileAsync('python', ['-m', 'pip', 'install', '-U', 'yt-dlp', '--break-system-packages']);
      logWithTimestamp('log', '[YOUFY] yt-dlp auto-update succeeded via python -m pip.');
    } catch (pythonError) {
      logWithTimestamp('error', `[YOUFY ERROR] yt-dlp auto-update failed. ${pythonError.message || pipError.message}`);
    }
  }
}

function parseCookieLine(line) {
  const parts = line.split('\t');
  if (parts.length < 7) {
    return null;
  }

  return {
    domain: parts[0],
    expiresAt: Number(parts[4]),
    name: parts[5],
  };
}

async function checkCookieFreshness() {
  const cookiesPath = process.env.YT_DLP_COOKIES?.trim();
  if (!cookiesPath) {
    return;
  }

  try {
    const fileContents = await fs.readFile(cookiesPath, 'utf8');
    const youtubeCookies = fileContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map(parseCookieLine)
      .filter(Boolean)
      .filter((cookie) => cookie.domain.includes('youtube.com') && cookie.expiresAt > 0);

    if (!youtubeCookies.length) {
      logWithTimestamp('warn', '[YOUFY WARNING] No expiring .youtube.com cookies were found in cookies.txt.');
      return;
    }

    const latestExpiry = Math.max(...youtubeCookies.map((cookie) => cookie.expiresAt * 1000));
    const nearestExpiry = Math.min(...youtubeCookies.map((cookie) => cookie.expiresAt * 1000));
    const daysUntilNearestExpiry = Math.floor((nearestExpiry - Date.now()) / ONE_DAY_MS);

    if (nearestExpiry <= Date.now()) {
      logWithTimestamp('error', '[YOUFY ERROR] YouTube cookies are expired. Refresh cookies.txt before playback breaks.');
      return;
    }

    if (daysUntilNearestExpiry <= COOKIE_WARNING_DAYS) {
      logWithTimestamp(
        'warn',
        `[YOUFY WARNING] YouTube cookies expire in ${daysUntilNearestExpiry} days. Please refresh cookies.txt before playback breaks.`
      );
      return;
    }

    logWithTimestamp('log', `[YOUFY] YouTube cookies are healthy. Latest expiry: ${new Date(latestExpiry).toISOString()}`);
  } catch (error) {
    logWithTimestamp('error', `[YOUFY ERROR] Failed to inspect cookies.txt. ${error.message}`);
  }
}

/**
 * Starts yt-dlp update and cookie freshness background jobs.
 * Safe to call multiple times; jobs start only once.
 * @returns {void}
 */
function startBackgroundServices() {
  if (jobsStarted) {
    return;
  }

  jobsStarted = true;

  cron.schedule('0 3 * * 0', () => {
    updateYtDlp().catch((error) => {
      logWithTimestamp('error', `[YOUFY ERROR] Scheduled yt-dlp update crashed. ${error.message}`);
    });
  });

  cron.schedule('0 0 * * *', () => {
    checkCookieFreshness().catch((error) => {
      logWithTimestamp('error', `[YOUFY ERROR] Scheduled cookie check crashed. ${error.message}`);
    });
  });

  checkCookieFreshness().catch((error) => {
    logWithTimestamp('error', `[YOUFY ERROR] Initial cookie check crashed. ${error.message}`);
  });
}

module.exports = { startBackgroundServices };
