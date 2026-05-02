const test = require('node:test');
const assert = require('node:assert/strict');

const {
  durationSimilarity,
  findBestCandidate,
  normalizeString,
  scoreCandidate,
} = require('../src/modules/playlistImport/TrackMatchingService');

test('normalizeString lowercases and removes punctuation noise', () => {
  assert.equal(normalizeString('  Beyonce - Halo!!  '), 'beyonce halo');
});

test('findBestCandidate returns exact match when title and artist align', () => {
  const result = findBestCandidate(
    { name: 'Blinding Lights', artist: 'The Weeknd', duration: 200 },
    [
      { videoId: 'abc123', title: 'Blinding Lights', artist: 'The Weeknd', durationSeconds: 200 },
      { videoId: 'def456', title: 'Other Song', artist: 'Another Artist', durationSeconds: 180 },
    ]
  );

  assert.equal(result.status, 'matched');
  assert.equal(result.score, 1);
  assert.equal(result.youfyTrack.videoId, 'abc123');
});

test('scoreCandidate favors title, artist, and duration together', () => {
  const score = scoreCandidate(
    { name: 'Numb', artist: 'Linkin Park', duration: 187 },
    { title: 'Numb', artist: 'Linkin Park', durationSeconds: 188 }
  );

  assert.ok(score.score > 0.95);
  assert.ok(durationSimilarity(187, 188) > 0.95);
});

test('findBestCandidate marks weak results as unmatched below threshold', () => {
  const result = findBestCandidate(
    { name: 'Some Totally Unknown Song', artist: 'Imaginary Artist', duration: 210 },
    [
      { videoId: 'zzz999', title: 'Different Tune', artist: 'Other Person', durationSeconds: 120 },
    ]
  );

  assert.equal(result.status, 'unmatched');
  assert.equal(result.youfyTrack, null);
});
