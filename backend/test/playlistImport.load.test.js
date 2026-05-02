const test = require('node:test');
const assert = require('node:assert/strict');

const { findBestCandidate } = require('../src/modules/playlistImport/TrackMatchingService');

test('matching engine handles 1200-track synthetic playlists while preserving order', () => {
  const tracks = Array.from({ length: 1200 }, (_, index) => ({
    name: `Song ${index}`,
    artist: `Artist ${index % 40}`,
    duration: 180 + (index % 12),
  }));

  const startedAt = Date.now();
  const results = tracks.map((track, index) => ({
    index,
    result: findBestCandidate(track, [
      {
        videoId: `match-${index}`,
        title: track.name,
        artist: track.artist,
        durationSeconds: track.duration,
      },
      {
        videoId: `noise-${index}`,
        title: `Remix ${index}`,
        artist: `Other ${index}`,
        durationSeconds: 90,
      },
    ]),
  }));

  const durationMs = Date.now() - startedAt;
  assert.equal(results.length, 1200);
  assert.ok(results.every(entry => entry.result.status === 'matched'));
  assert.deepEqual(
    results.slice(0, 5).map(entry => entry.index),
    [0, 1, 2, 3, 4]
  );
  assert.ok(durationMs < 5000);
});
