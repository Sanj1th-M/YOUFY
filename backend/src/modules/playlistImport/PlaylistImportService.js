const {
  getSpotifyPlaylists,
  getSpotifyTracks,
  getYouTubePlaylists,
  getYouTubeTracks,
} = require('./PlaylistSourceService');
const { matchTracks } = require('./TrackMatchingService');
const { getValidAccessToken } = require('./TokenService');
const {
  completePreviewJob,
  createImportedPlaylist,
  createPreviewJob,
  failJob,
  findActivePreviewJob,
  getConnectedSources,
  getJob,
  recordAnalytics,
  updateJob,
} = require('./storage');

async function loadSourcePlaylists(source, accessToken) {
  if (source === 'spotify') return getSpotifyPlaylists(accessToken);
  if (source === 'youtube') return getYouTubePlaylists(accessToken);

  const error = new Error('Unsupported source');
  error.status = 400;
  throw error;
}

async function loadSourceTracks(source, accessToken, playlistId) {
  if (source === 'spotify') return getSpotifyTracks(accessToken, playlistId);
  if (source === 'youtube') return getYouTubeTracks(accessToken, playlistId);

  const error = new Error('Unsupported source');
  error.status = 400;
  throw error;
}

async function listConnectedSources(uid, configuredSources) {
  let connected = {};

  try {
    connected = await getConnectedSources(uid);
  } catch (error) {
    // Do not fail the whole import screen if token storage lookup is unavailable.
    console.error('[playlist-import] connected source lookup failed:', error.message);
  }

  return configuredSources.map(source => ({
    ...source,
    connected: Boolean(connected[source.id]?.connected),
    expiresSoon: Boolean(connected[source.id]?.expiresSoon),
    updatedAt: connected[source.id]?.updatedAt || null,
  }));
}

async function listSourcePlaylists(uid, source) {
  const accessToken = await getValidAccessToken(uid, source);
  return loadSourcePlaylists(source, accessToken);
}

async function schedulePreview({ uid, source, sourcePlaylistId, enqueuePreviewJob }) {
  const existing = await findActivePreviewJob(uid, source, sourcePlaylistId);
  if (existing) return existing;

  const job = await createPreviewJob({ uid, source, sourcePlaylistId });
  await enqueuePreviewJob({
    uid,
    jobId: job.id,
    source,
    sourcePlaylistId,
  });

  return job;
}

async function processPreviewJob({ uid, jobId, source, sourcePlaylistId }) {
  try {
    await updateJob(uid, jobId, {
      status: 'processing',
      progress: 5,
    });

    const accessToken = await getValidAccessToken(uid, source);
    const playlist = await loadSourceTracks(source, accessToken, sourcePlaylistId);

    await updateJob(uid, jobId, {
      playlistTitle: playlist.title,
      totalTracks: Array.isArray(playlist.tracks) ? playlist.tracks.length : 0,
      progress: 10,
    });

    const matches = await matchTracks(playlist.tracks || [], {
      onProgress: async ({ completed, total, percent }) => {
        const clamped = Math.min(95, Math.max(10, percent));
        if (completed === total || completed % 10 === 0) {
          await updateJob(uid, jobId, {
            status: 'processing',
            progress: clamped,
            totalTracks: total,
          });
        }
      },
    });

    await completePreviewJob(uid, jobId, {
      source,
      sourcePlaylistId,
      playlistTitle: playlist.title,
      matches,
    });

    const matchedCount = matches.filter(item => item.status === 'matched').length;
    const unmatchedCount = matches.length - matchedCount;
    await recordAnalytics(uid, jobId, 'preview_ready', {
      source,
      totalTracks: matches.length,
      matchedCount,
      unmatchedCount,
      matchAccuracy: matches.length ? matchedCount / matches.length : 0,
    });
  } catch (error) {
    await failJob(uid, jobId, error.message || 'Preview generation failed');
    throw error;
  }
}

async function confirmImport(uid, jobId) {
  const job = await getJob(uid, jobId);
  if (!job) {
    const error = new Error('Import job not found');
    error.status = 404;
    throw error;
  }

  if (job.status === 'imported' && job.playlistId) {
    return {
      playlistId: job.playlistId,
      status: job.status,
    };
  }

  if (job.status !== 'preview_ready') {
    const error = new Error('Import preview is not ready yet');
    error.status = 409;
    throw error;
  }

  const playlist = await createImportedPlaylist(uid, job);
  await recordAnalytics(uid, jobId, 'import_completed', {
    source: job.source,
    totalTracks: job.totalTracks,
    matchedCount: job.matchedCount,
    unmatchedCount: job.unmatchedCount,
    matchAccuracy: job.totalTracks ? job.matchedCount / job.totalTracks : 0,
  });

  return {
    playlistId: playlist.id,
    status: 'imported',
  };
}

module.exports = {
  confirmImport,
  listConnectedSources,
  listSourcePlaylists,
  processPreviewJob,
  schedulePreview,
};
