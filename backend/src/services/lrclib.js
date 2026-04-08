const axios = require('axios');

// lrclib.net — free, no API key required
async function getLyrics(title, artist, album = '') {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.append('album_name', album);

    const response = await axios.get(
      `https://lrclib.net/api/get?${params.toString()}`,
      { timeout: 5000 }
    );

    return {
      synced: parseLrc(response.data.syncedLyrics || ''),
      plain: response.data.plainLyrics || '',
    };
  } catch {
    return { synced: [], plain: '' };
  }
}

function parseLrc(lrc) {
  if (!lrc) return [];
  return lrc.split('\n')
    .map(line => {
      const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
      if (!match) return null;
      const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
      return { time, text: match[3].trim() };
    })
    .filter(Boolean);
}

module.exports = { getLyrics };
