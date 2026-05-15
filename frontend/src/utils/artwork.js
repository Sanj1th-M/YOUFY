const GOOGLE_ARTWORK_HOSTS = [
  'googleusercontent.com',
  'ggpht.com',
  'ytimg.com',
];

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

function isAllowedArtworkUrl(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('/')) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isGoogleArtworkUrl(value) {
  try {
    const { hostname } = new URL(value);
    return GOOGLE_ARTWORK_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function pushUnique(list, value) {
  if (isAllowedArtworkUrl(value) && !list.includes(value)) {
    list.push(value);
  }
}

export function resizeArtworkUrl(value, size = 512) {
  if (!isAllowedArtworkUrl(value) || value.startsWith('/') || !isGoogleArtworkUrl(value)) {
    return value || '';
  }

  return value
    .replace(/=w\d+-h\d+([^&#?/]*)/, `=w${size}-h${size}$1`)
    .replace(/=s\d+([^&#?/]*)/, `=s${size}$1`);
}

export function getBestThumbnail(thumbnails, fallback = '', size = 512) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  return resizeArtworkUrl(url, size) || fallback;
}

export function getVideoThumbnail(videoId) {
  if (!VIDEO_ID_REGEX.test(videoId || '')) return '';
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getArtworkSources(item = {}, options = {}) {
  const { fallback = '', size = 512, includeVideoFallback = true } = options;
  const sources = [];
  const rawUrls = [];

  if (Array.isArray(item?.thumbnails)) {
    item.thumbnails.forEach(thumbnail => {
      if (thumbnail?.url) rawUrls.push(thumbnail.url);
    });
  }

  if (item?.thumbnail?.url) {
    rawUrls.push(item.thumbnail.url);
  } else if (typeof item?.thumbnail === 'string') {
    rawUrls.push(item.thumbnail);
  }

  rawUrls.reverse().forEach((url) => {
    pushUnique(sources, resizeArtworkUrl(url, size));
    pushUnique(sources, url);
    pushUnique(sources, resizeArtworkUrl(url, 226));
    pushUnique(sources, resizeArtworkUrl(url, 120));
  });

  if (includeVideoFallback) {
    pushUnique(sources, getVideoThumbnail(item?.videoId));
  }

  pushUnique(sources, fallback);
  return sources;
}
