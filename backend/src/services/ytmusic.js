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

async function getHomeSections() {
  const client = await getClient();
  return await client.getHomeSections();
}

module.exports = { searchSongs, searchAlbums, searchArtists, getHomeSections };
