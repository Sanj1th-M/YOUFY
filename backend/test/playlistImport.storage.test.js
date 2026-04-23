const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeSongsByVideoId,
  normalizePlaylistTitle,
  shouldImportIntoLikedSongs,
} = require('../src/modules/playlistImport/storage');

test('playlist import normalizes liked-playlist titles conservatively', () => {
  assert.equal(normalizePlaylistTitle('  LIKED_SONGS-2  '), 'liked songs 2');
  assert.equal(shouldImportIntoLikedSongs('Liked Songs'), true);
  assert.equal(shouldImportIntoLikedSongs('LIKED SONGS2'), true);
  assert.equal(shouldImportIntoLikedSongs('LIKED SONGS 2'), true);
  assert.equal(shouldImportIntoLikedSongs('Liked Music'), true);
  assert.equal(shouldImportIntoLikedSongs('Road Trip Songs 2'), false);
});

test('playlist import merge keeps imported songs first and removes duplicates', () => {
  const merged = mergeSongsByVideoId(
    [
      { videoId: 'imported-1', title: 'Imported first' },
      { videoId: 'shared-id', title: 'Imported shared' },
    ],
    [
      { videoId: 'shared-id', title: 'Existing shared' },
      { videoId: 'existing-1', title: 'Existing first' },
    ]
  );

  assert.deepEqual(
    merged.map((song) => song.videoId),
    ['imported-1', 'shared-id', 'existing-1']
  );
});
