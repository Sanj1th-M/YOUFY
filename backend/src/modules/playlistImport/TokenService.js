const {
  createStateToken,
  getClientId,
  getClientSecret,
  getRedirectUri,
  getSourceConfig,
  isSourceConfigured,
} = require('./config');
const { createCodeChallenge, createCodeVerifier } = require('./pkce');
const { requestWithRetry } = require('./httpClient');
const {
  TOKEN_REFRESH_SKEW_MS,
  createOAuthState,
  getProviderToken,
  storeProviderToken,
} = require('./storage');

function requireConfiguredSource(source) {
  const sourceConfig = getSourceConfig(source);
  if (!sourceConfig || !isSourceConfigured(source)) {
    const error = new Error('Playlist source is not configured');
    error.status = 503;
    throw error;
  }
  return sourceConfig;
}

function tokenForm(source, values) {
  const form = new URLSearchParams(values);
  const clientSecret = getClientSecret(source);
  if (clientSecret) form.set('client_secret', clientSecret);
  return form;
}

async function createAuthorizationUrl({ uid, source }) {
  const sourceConfig = requireConfiguredSource(source);
  const state = createStateToken();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  await createOAuthState({ uid, source, state, codeVerifier });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(source),
    redirect_uri: getRedirectUri(source),
    scope: sourceConfig.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  if (source === 'youtube') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
    params.set('include_granted_scopes', 'true');
  }

  return `${sourceConfig.authUrl}?${params.toString()}`;
}

async function exchangeCodeForToken({ uid, source, code, codeVerifier }) {
  const sourceConfig = requireConfiguredSource(source);
  const response = await requestWithRetry({
    method: 'POST',
    url: sourceConfig.tokenUrl,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: tokenForm(source, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(source),
      client_id: getClientId(source),
      code_verifier: codeVerifier,
    }).toString(),
  }, { fallbackMessage: 'OAuth token exchange failed' });

  await storeProviderToken(uid, source, response.data || {});
}

async function refreshToken({ uid, source, refreshToken }) {
  const sourceConfig = requireConfiguredSource(source);
  if (!refreshToken) {
    const error = new Error('Provider reconnect required');
    error.status = 401;
    throw error;
  }

  const response = await requestWithRetry({
    method: 'POST',
    url: sourceConfig.tokenUrl,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: tokenForm(source, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: getClientId(source),
    }).toString(),
  }, { fallbackMessage: 'OAuth token refresh failed' });

  await storeProviderToken(uid, source, response.data || {});
  return response.data?.access_token || '';
}

async function getValidAccessToken(uid, source) {
  requireConfiguredSource(source);
  const token = await getProviderToken(uid, source);
  if (!token?.accessToken) {
    const error = new Error('Provider is not connected');
    error.status = 401;
    throw error;
  }

  if (token.expiresAtMillis > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return token.accessToken;
  }

  const refreshed = await refreshToken({
    uid,
    source,
    refreshToken: token.refreshToken,
  });

  return refreshed || (await getProviderToken(uid, source))?.accessToken || '';
}

module.exports = {
  createAuthorizationUrl,
  exchangeCodeForToken,
  getValidAccessToken,
};
