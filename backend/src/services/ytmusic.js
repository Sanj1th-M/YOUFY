const YTMusic = require('ytmusic-api');

let ytmusic = null;

async function getClient() {
  if (!ytmusic) {
    ytmusic = new YTMusic();
    await ytmusic.initialize();
  }
  return ytmusic;
}

async function searchSongs(query) {
  const client = await getClient();
  return await client.searchSongs(query);
}

async function searchAlbums(query) {
  const client = await getClient();
  return await client.searchAlbums(query);
}

async function searchArtists(query) {
  const client = await getClient();
  return await client.searchArtists(query);
}

async function searchPlaylists(query) {
  const client = await getClient();
  try {
    const result = await client.searchPlaylists(query);
    // Required verification log: check raw ytmusic-api fields via /search?q=test
    if (query === 'test') {
      console.log(
        '[ytmusic] searchPlaylists("test") sample:',
        JSON.stringify(Array.isArray(result) ? result.slice(0, 2) : result, null, 2)
      );
    }
    return result;
  } catch (err) {
    console.error('[ytmusic] searchPlaylists failed:', err.message);
    return [];
  }
}

async function getAlbum(browseId) {
  const client = await getClient();
  try {
    return await client.getAlbum(browseId);
  } catch (err) {
    console.error('[ytmusic] getAlbum failed:', err.message);
    return null;
  }
}

async function getArtist(artistId) {
  const client = await getClient();
  try {
    return await client.getArtist(artistId);
  } catch (err) {
    console.error('[ytmusic] getArtist failed:', err.message);
    return null;
  }
}

async function getHomeSections() {
  const client = await getClient();
  return await client.getHomeSections();
}

async function getPlaylist(playlistId) {
  const client = await getClient();
  try {
    return await client.getPlaylist(playlistId);
  } catch (err) {
    console.error('[ytmusic] getPlaylist failed:', err.message);
    return null;
  }
}

async function getPlaylistVideos(playlistId) {
  const client = await getClient();
  try {
    return await client.getPlaylistVideos(playlistId);
  } catch (err) {
    console.error('[ytmusic] getPlaylistVideos failed:', err.message);
    return [];
  }
}

module.exports = {
  searchSongs,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  getAlbum,
  getArtist,
  getHomeSections,
  getPlaylist,
  getPlaylistVideos,
};
