const { getSourceConfig } = require('./config');
const { requestWithRetry } = require('./httpClient');

const SPOTIFY_PLAYLIST_ID = /^[A-Za-z0-9]{1,80}$/;
const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{2,128}$/;

function sanitizeText(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

function toSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function parseIso8601Duration(duration) {
  if (typeof duration !== 'string') return 0;
  const days = Number(duration.match(/(\d+)D/)?.[1] || 0);
  const hours = Number(duration.match(/(\d+)H/)?.[1] || 0);
  const minutes = Number(duration.match(/(\d+)M/)?.[1] || 0);
  const seconds = Number(duration.match(/(\d+)S/)?.[1] || 0);
  return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
}

function parseYoutubeTitle(title, fallbackArtist) {
  const cleanTitle = sanitizeText(title, 240);
  const cleanArtist = sanitizeText(fallbackArtist, 160);

  if (cleanTitle.includes(' - ')) {
    const [artist, ...rest] = cleanTitle.split(' - ');
    const name = rest.join(' - ');
    if (artist && name) {
      return {
        name: sanitizeText(name, 200),
        artist: sanitizeText(artist, 200),
      };
    }
  }

  return {
    name: cleanTitle,
    artist: cleanArtist,
  };
}

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function fetchAllPages(initialConfig) {
  const items = [];
  let nextConfig = initialConfig;
  let pageCount = 0;

  while (nextConfig && pageCount < 25) {
    pageCount += 1;
    const response = await requestWithRetry(nextConfig, {
      fallbackMessage: 'Failed to fetch playlist source data',
    });
    const data = response.data || {};
    if (Array.isArray(data.items)) items.push(...data.items);

    if (!data.next && !data.nextPageToken) break;

    if (data.next) {
      nextConfig = {
        method: 'GET',
        url: data.next,
        headers: initialConfig.headers,
      };
    } else {
      nextConfig = {
        ...initialConfig,
        params: {
          ...initialConfig.params,
          pageToken: data.nextPageToken,
        },
      };
    }
  }

  return items;
}

async function getSpotifyPlaylists(userToken) {
  const source = getSourceConfig('spotify');
  const items = await fetchAllPages({
    method: 'GET',
    url: `${source.apiBaseUrl}/me/playlists`,
    headers: authHeaders(userToken),
    params: {
      limit: 50,
      fields: 'items(id,name,tracks(total),owner(display_name)),next',
    },
  });

  return items.map(item => ({
    id: sanitizeText(item?.id, 80),
    title: sanitizeText(item?.name || 'Untitled playlist', 200),
    totalTracks: toSeconds(item?.tracks?.total),
    owner: sanitizeText(item?.owner?.display_name, 160),
  })).filter(item => item.id);
}

async function getSpotifyTracks(userToken, playlistId) {
  if (!SPOTIFY_PLAYLIST_ID.test(playlistId)) {
    const error = new Error('Invalid Spotify playlist id');
    error.status = 400;
    throw error;
  }

  const source = getSourceConfig('spotify');
  const [metadataResponse, items] = await Promise.all([
    requestWithRetry({
      method: 'GET',
      url: `${source.apiBaseUrl}/playlists/${playlistId}`,
      headers: authHeaders(userToken),
      params: { fields: 'name' },
    }, { fallbackMessage: 'Failed to fetch Spotify playlist metadata' }),
    fetchAllPages({
      method: 'GET',
      url: `${source.apiBaseUrl}/playlists/${playlistId}/tracks`,
      headers: authHeaders(userToken),
      params: {
        limit: 100,
        fields: 'items(track(name,artists(name),album(name),duration_ms,id,is_local)),next',
      },
    }),
  ]);

  return {
    title: sanitizeText(metadataResponse.data?.name || 'Imported Spotify Playlist', 200),
    tracks: items
      .map(item => item?.track)
      .filter(track => track && !track.is_local)
      .map(track => ({
        name: sanitizeText(track.name, 200),
        artist: sanitizeText((track.artists || []).map(artist => artist?.name).filter(Boolean).join(', '), 200),
        album: sanitizeText(track.album?.name, 200),
        duration: toSeconds((track.duration_ms || 0) / 1000),
      }))
      .filter(track => track.name),
  };
}

async function getYouTubePlaylists(userToken) {
  const source = getSourceConfig('youtube');
  const items = await fetchAllPages({
    method: 'GET',
    url: `${source.apiBaseUrl}/playlists`,
    headers: authHeaders(userToken),
    params: {
      part: 'snippet,contentDetails',
      mine: true,
      maxResults: 50,
    },
  });

  return items.map(item => ({
    id: sanitizeText(item?.id, 128),
    title: sanitizeText(item?.snippet?.title || 'Untitled playlist', 200),
    totalTracks: toSeconds(item?.contentDetails?.itemCount),
    owner: sanitizeText(item?.snippet?.channelTitle, 160),
  })).filter(item => item.id);
}

async function getYouTubeVideoDetails(userToken, videoIds) {
  if (!videoIds.length) return new Map();

  const source = getSourceConfig('youtube');
  const details = new Map();

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const response = await requestWithRetry({
      method: 'GET',
      url: `${source.apiBaseUrl}/videos`,
      headers: authHeaders(userToken),
      params: {
        part: 'snippet,contentDetails',
        id: batch.join(','),
        maxResults: 50,
      },
    }, { fallbackMessage: 'Failed to fetch YouTube video details' });

    for (const item of response.data?.items || []) {
      details.set(item.id, item);
    }
  }

  return details;
}

async function getYouTubeTracks(userToken, playlistId) {
  if (!YOUTUBE_PLAYLIST_ID.test(playlistId)) {
    const error = new Error('Invalid YouTube playlist id');
    error.status = 400;
    throw error;
  }

  const source = getSourceConfig('youtube');
  const [metadataResponse, playlistItems] = await Promise.all([
    requestWithRetry({
      method: 'GET',
      url: `${source.apiBaseUrl}/playlists`,
      headers: authHeaders(userToken),
      params: {
        part: 'snippet',
        id: playlistId,
        maxResults: 1,
      },
    }, { fallbackMessage: 'Failed to fetch YouTube playlist metadata' }),
    fetchAllPages({
      method: 'GET',
      url: `${source.apiBaseUrl}/playlistItems`,
      headers: authHeaders(userToken),
      params: {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: 50,
      },
    }),
  ]);

  const videoIds = playlistItems
    .map(item => sanitizeText(item?.contentDetails?.videoId, 32))
    .filter(Boolean);
  const details = await getYouTubeVideoDetails(userToken, videoIds);

  return {
    title: sanitizeText(metadataResponse.data?.items?.[0]?.snippet?.title || 'Imported YouTube Music Playlist', 200),
    tracks: playlistItems
      .map(item => {
        const videoId = sanitizeText(item?.contentDetails?.videoId, 32);
        const detail = details.get(videoId);
        const parsed = parseYoutubeTitle(
          detail?.snippet?.title || item?.snippet?.title,
          detail?.snippet?.channelTitle || item?.snippet?.videoOwnerChannelTitle
        );

        return {
          name: parsed.name,
          artist: parsed.artist,
          album: '',
          duration: parseIso8601Duration(detail?.contentDetails?.duration),
        };
      })
      .filter(track => track.name),
  };
}

module.exports = {
  getSpotifyPlaylists,
  getSpotifyTracks,
  getYouTubePlaylists,
  getYouTubeTracks,
  parseIso8601Duration,
  parseYoutubeTitle,
};
