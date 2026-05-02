const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const { createPlaylistImportRouter } = require('../src/modules/playlistImport/router');

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/playlist-import', router);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('playlist import router exposes config, preview, confirm, and OAuth callback flows', async () => {
  process.env.PLAYLIST_IMPORT_ENABLED = 'true';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const router = createPlaylistImportRouter({
    authMiddleware: (req, res, next) => {
      req.user = { uid: 'user-123' };
      next();
    },
    enqueuePreviewJob: async () => ({ id: 'job-123' }),
    services: {
      createAuthorizationUrl: async () => 'https://accounts.example.test/auth',
      consumeOAuthState: async () => ({ uid: 'user-123', codeVerifier: 'verifier' }),
      exchangeCodeForToken: async () => {},
      listConnectedSources: async (uid, sources) => sources.map(source => ({
        ...source,
        connected: source.id === 'spotify',
      })),
      listSourcePlaylists: async () => [{ id: 'playlist-1', title: 'Saved', totalTracks: 12 }],
      schedulePreview: async () => ({ id: 'job-123', status: 'queued' }),
      getJob: async () => ({ id: 'job-123', status: 'preview_ready', matches: [] }),
      confirmImport: async () => ({ playlistId: 'new-playlist', status: 'imported' }),
    },
  });

  const server = await startServer(router);

  try {
    const configResponse = await fetch(`${server.baseUrl}/playlist-import/config`);
    const configJson = await configResponse.json();
    assert.equal(configJson.enabled, true);
    assert.equal(configJson.featureFlag, 'playlist_import_enabled');

    const sourceResponse = await fetch(`${server.baseUrl}/playlist-import/sources`);
    const sourceJson = await sourceResponse.json();
    assert.equal(sourceJson.sources.find(source => source.id === 'spotify').connected, true);

    const playlistsResponse = await fetch(`${server.baseUrl}/playlist-import/sources/spotify/playlists`);
    const playlistsJson = await playlistsResponse.json();
    assert.equal(playlistsJson.playlists[0].id, 'playlist-1');

    const previewResponse = await fetch(`${server.baseUrl}/playlist-import/sources/spotify/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId: 'playlist-1' }),
    });
    const previewJson = await previewResponse.json();
    assert.equal(previewResponse.status, 202);
    assert.equal(previewJson.job.id, 'job-123');

    const confirmResponse = await fetch(`${server.baseUrl}/playlist-import/jobs/job-123/confirm`, {
      method: 'POST',
    });
    const confirmJson = await confirmResponse.json();
    assert.equal(confirmResponse.status, 201);
    assert.equal(confirmJson.playlistId, 'new-playlist');

    const callbackResponse = await fetch(
      `${server.baseUrl}/playlist-import/oauth/spotify/callback?code=abc&state=def`,
      { redirect: 'manual' }
    );
    assert.equal(callbackResponse.status, 302);
    assert.match(
      callbackResponse.headers.get('location'),
      /http:\/\/localhost:5173\/import-playlist\?source=spotify&oauth=connected/
    );
  } finally {
    await server.close();
  }
});

test('playlist import router returns safe storage-unavailable errors for OAuth start', async () => {
  process.env.PLAYLIST_IMPORT_ENABLED = 'true';

  const router = createPlaylistImportRouter({
    authMiddleware: (req, res, next) => {
      req.user = { uid: 'user-123' };
      next();
    },
    services: {
      createAuthorizationUrl: async () => {
        const error = new Error('Playlist import storage is unavailable. Check Firebase/Firestore configuration.');
        error.status = 503;
        throw error;
      },
    },
  });

  const server = await startServer(router);

  try {
    const response = await fetch(`${server.baseUrl}/playlist-import/oauth/youtube/start`, {
      method: 'POST',
    });
    const json = await response.json();

    assert.equal(response.status, 503);
    assert.equal(json.error, 'Playlist import storage is unavailable. Check Firebase/Firestore configuration.');
  } finally {
    await server.close();
  }
});
