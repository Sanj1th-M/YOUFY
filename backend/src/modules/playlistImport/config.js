const crypto = require('crypto');

const FEATURE_FLAG = 'playlist_import_enabled';

const SOURCES = Object.freeze({
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    apiBaseUrl: 'https://api.spotify.com/v1',
    scopes: ['playlist-read-private'],
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube Music',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    apiBaseUrl: 'https://www.googleapis.com/youtube/v3',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  },
});

function getPublicBackendUrl() {
  return (process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`)
    .replace(/\/+$/, '');
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

function getRedirectUri(source) {
  return `${getPublicBackendUrl()}/playlist-import/oauth/${source}/callback`;
}

function isPlaylistImportEnabled() {
  const explicit = String(process.env.PLAYLIST_IMPORT_ENABLED || '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(explicit)) return true;

  const flags = String(process.env.FEATURE_FLAGS || '')
    .split(',')
    .map(flag => flag.trim())
    .filter(Boolean);

  return flags.includes(FEATURE_FLAG);
}

function getRolloutPercentage() {
  const raw = Number(process.env.PLAYLIST_IMPORT_ROLLOUT_PERCENT || 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

function isPlaylistImportAvailableForUser(uid) {
  if (!isPlaylistImportEnabled()) return false;
  const rolloutPercentage = getRolloutPercentage();
  if (rolloutPercentage >= 100) return true;
  if (!uid) return false;

  const digest = crypto.createHash('sha256').update(uid, 'utf8').digest();
  const bucket = digest[0];
  return bucket < Math.floor((rolloutPercentage / 100) * 256);
}

function getSourceConfig(source) {
  if (source === 'spotify') return SOURCES.spotify;
  if (source === 'youtube') return SOURCES.youtube;
  return null;
}

function listSources() {
  return Object.values(SOURCES).map(source => ({
    id: source.id,
    label: source.label,
    configured: isSourceConfigured(source.id),
  }));
}

function isSourceConfigured(source) {
  if (source === 'spotify') {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  }

  if (source === 'youtube') {
    return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  }

  return false;
}

function getClientId(source) {
  if (source === 'spotify') return process.env.SPOTIFY_CLIENT_ID || '';
  if (source === 'youtube') return process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  return '';
}

function getClientSecret(source) {
  if (source === 'spotify') return process.env.SPOTIFY_CLIENT_SECRET || '';
  if (source === 'youtube') return process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  return '';
}

function createStateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  FEATURE_FLAG,
  SOURCES,
  createStateToken,
  getClientId,
  getClientSecret,
  getFrontendUrl,
  getPublicBackendUrl,
  getRedirectUri,
  getRolloutPercentage,
  getSourceConfig,
  isPlaylistImportAvailableForUser,
  isPlaylistImportEnabled,
  isSourceConfigured,
  listSources,
};
