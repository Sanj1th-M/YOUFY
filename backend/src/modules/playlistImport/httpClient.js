const axios = require('axios');

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toSafeError(error, fallbackMessage) {
  const status = error?.response?.status || 500;
  const safe = new Error(fallbackMessage);
  safe.status = status;
  safe.retryAfter = Number(error?.response?.headers?.['retry-after']) || 0;
  return safe;
}

async function requestWithRetry(config, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 250,
    timeout = 10000,
    fallbackMessage = 'Provider request failed',
  } = options;

  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await axios({
        ...config,
        timeout,
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 300,
      });
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retryable = !status || RETRYABLE_STATUS.has(status);

      if (!retryable || attempt === attempts - 1) {
        throw toSafeError(error, fallbackMessage);
      }

      const retryAfterMs = Number(error?.response?.headers?.['retry-after']) * 1000;
      const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.min(retryAfterMs, 5000)
        : baseDelayMs * (2 ** attempt);

      await wait(backoffMs);
    }
  }

  throw toSafeError(lastError, fallbackMessage);
}

module.exports = {
  requestWithRetry,
};
