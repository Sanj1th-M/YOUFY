const { Router } = require('express');
const { verifyToken } = require('../../middleware/auth');
const { importLimiter } = require('../../middleware/rateLimit');
const {
  FEATURE_FLAG,
  getFrontendUrl,
  getRolloutPercentage,
  isPlaylistImportAvailableForUser,
  listSources,
  isPlaylistImportEnabled,
} = require('./config');
const { createAuthorizationUrl, exchangeCodeForToken } = require('./TokenService');
const { consumeOAuthState, getJob } = require('./storage');
const {
  confirmImport,
  listConnectedSources,
  listSourcePlaylists,
  schedulePreview,
} = require('./PlaylistImportService');
const { enqueuePreviewJob } = require('./queue');

const SUPPORTED_SOURCES = new Set(['spotify', 'youtube']);

function sanitizeText(value, maxLength = 128) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

function requireFeatureEnabled(req, res, next) {
  const enabled = req.user?.uid
    ? isPlaylistImportAvailableForUser(req.user.uid)
    : isPlaylistImportEnabled();

  if (!enabled) {
    return res.status(403).json({
      error: 'Playlist import is not enabled',
      featureFlag: FEATURE_FLAG,
      enabled: false,
      rolloutPercentage: getRolloutPercentage(),
    });
  }
  return next();
}

function validateSource(source) {
  return SUPPORTED_SOURCES.has(source) ? source : '';
}

function validatePlaylistId(value) {
  const playlistId = sanitizeText(value, 128);
  return playlistId || '';
}

function sanitizeBackendMessage(error, fallback) {
  const message = sanitizeText(error?.message || '', 200);
  if (!message) return fallback;
  if (/^\d+\s+[A-Z_]+:/.test(message)) return fallback;
  return message;
}

// Security: Only pass known reason codes in redirect URLs — never raw error strings.
// The frontend also whitelists these codes, so this is defense-in-depth.
const KNOWN_REASON_CODES = new Set([
  'authorization_failed', 'access_denied', 'invalid_scope',
  'server_error', 'temporarily_unavailable', 'expired',
  'missing_code_or_state',
]);

function toSafeReasonCode(rawReason) {
  if (!rawReason || typeof rawReason !== 'string') return 'authorization_failed';
  const normalized = rawReason.trim().toLowerCase().replace(/\s+/g, '_');
  return KNOWN_REASON_CODES.has(normalized) ? normalized : 'authorization_failed';
}

function toFrontendRedirect(source, oauthStatus, reason) {
  const url = new URL('/import-playlist', `${getFrontendUrl()}/`);
  if (source) url.searchParams.set('source', source);
  if (oauthStatus) url.searchParams.set('oauth', oauthStatus);
  if (reason) url.searchParams.set('reason', toSafeReasonCode(reason));
  return url.toString();
}

function createPlaylistImportRouter(deps = {}) {
  const authMiddleware = deps.authMiddleware || verifyToken;
  const services = {
    createAuthorizationUrl,
    exchangeCodeForToken,
    consumeOAuthState,
    listConnectedSources,
    listSourcePlaylists,
    schedulePreview,
    getJob,
    confirmImport,
    ...(deps.services || {}),
  };
  const router = Router();

  router.get('/config', (req, res) => {
    res.json({
      enabled: isPlaylistImportEnabled(),
      featureFlag: FEATURE_FLAG,
      rolloutPercentage: getRolloutPercentage(),
      sources: listSources(),
    });
  });

  router.post('/oauth/:source/start', authMiddleware, requireFeatureEnabled, importLimiter, async (req, res) => {
    const source = validateSource(req.params.source);
    if (!source) {
      return res.status(400).json({ error: 'Unsupported playlist source' });
    }

    try {
      const authUrl = await services.createAuthorizationUrl({
        uid: req.user.uid,
        source,
      });
      return res.json({ authUrl });
    } catch (error) {
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to start authorization.') });
    }
  });

  router.get('/oauth/:source/callback', async (req, res) => {
    const source = validateSource(req.params.source);
    if (!source || !isPlaylistImportEnabled()) {
      return res.redirect(toFrontendRedirect(source, 'disabled'));
    }

    const code = sanitizeText(req.query.code, 400);
    const state = sanitizeText(req.query.state, 400);
    const providerError = sanitizeText(req.query.error, 120);

    if (providerError || !code || !state) {
      console.warn('[playlist-import] provider callback rejected', {
        source,
        providerError: providerError || 'missing_code_or_state',
      });
      return res.redirect(toFrontendRedirect(source, 'error', providerError || 'authorization_failed'));
    }

    try {
      const oauthState = await services.consumeOAuthState({ state, source });
      await services.exchangeCodeForToken({
        uid: oauthState.uid,
        source,
        code,
        codeVerifier: oauthState.codeVerifier,
      });
      return res.redirect(toFrontendRedirect(source, 'connected'));
    } catch (error) {
      console.warn('[playlist-import] callback validation failed', {
        source,
        reason: error.message,
      });
      return res.redirect(toFrontendRedirect(source, 'error', error.message));
    }
  });

  router.get('/sources', authMiddleware, requireFeatureEnabled, async (req, res) => {
    try {
      const sources = await services.listConnectedSources(req.user.uid, listSources());
      return res.json({ sources });
    } catch (error) {
      console.error('[playlist-import] sources route failed:', error.message);
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to load connected sources.') });
    }
  });

  router.get('/sources/:source/playlists', authMiddleware, requireFeatureEnabled, async (req, res) => {
    const source = validateSource(req.params.source);
    if (!source) {
      return res.status(400).json({ error: 'Unsupported playlist source' });
    }

    try {
      const playlists = await services.listSourcePlaylists(req.user.uid, source);
      return res.json({ playlists });
    } catch (error) {
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to load source playlists.') });
    }
  });

  router.post('/sources/:source/preview', authMiddleware, requireFeatureEnabled, importLimiter, async (req, res) => {
    const source = validateSource(req.params.source);
    const playlistId = validatePlaylistId(req.body?.playlistId);
    if (!source || !playlistId) {
      return res.status(400).json({ error: 'Invalid playlist preview payload' });
    }

    try {
      const job = await services.schedulePreview({
        uid: req.user.uid,
        source,
        sourcePlaylistId: playlistId,
        enqueuePreviewJob: deps.enqueuePreviewJob || enqueuePreviewJob,
      });
      return res.status(202).json({ job });
    } catch (error) {
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to start import preview.') });
    }
  });

  router.get('/jobs/:jobId', authMiddleware, requireFeatureEnabled, async (req, res) => {
    const jobId = sanitizeText(req.params.jobId, 80);
    if (!jobId) {
      return res.status(400).json({ error: 'Invalid import job id' });
    }

    try {
      const job = await services.getJob(req.user.uid, jobId);
      if (!job) {
        return res.status(404).json({ error: 'Import job not found' });
      }
      return res.json({ job });
    } catch (error) {
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to load import job.') });
    }
  });

  router.post('/jobs/:jobId/confirm', authMiddleware, requireFeatureEnabled, importLimiter, async (req, res) => {
    const jobId = sanitizeText(req.params.jobId, 80);
    if (!jobId) {
      return res.status(400).json({ error: 'Invalid import job id' });
    }

    try {
      const result = await services.confirmImport(req.user.uid, jobId);
      return res.status(201).json(result);
    } catch (error) {
      return res.status(error.status || 500).json({ error: sanitizeBackendMessage(error, 'Failed to confirm import.') });
    }
  });

  return router;
}

module.exports = {
  createPlaylistImportRouter,
};
