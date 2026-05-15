const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanTitle,
  findBestMatch,
  parseLrc,
  scoreMatch,
} = require('../src/services/lrclib');

test('parseLrc returns bounded synced lyric lines', () => {
  assert.deepEqual(parseLrc('[00:01.50]Hello\n[00:03.00]World'), [
    { time: 1.5, text: 'Hello' },
    { time: 3, text: 'World' },
  ]);
});

test('cleanTitle removes common YouTube video suffixes', () => {
  assert.equal(cleanTitle('Shape of You (Official Music Video)'), 'Shape of You');
  assert.equal(cleanTitle('Numb - Official Audio'), 'Numb');
});

test('findBestMatch accepts cleaned YouTube titles with matching artist', () => {
  const result = findBestMatch(
    [
      {
        trackName: 'Shape of You',
        artistName: 'Ed Sheeran',
        duration: 234,
        plainLyrics: 'The club is not the best place to find a lover',
      },
    ],
    {
      title: 'Shape of You Official Music Video',
      artist: 'Ed Sheeran',
      durationSeconds: 233,
    }
  );

  assert.equal(result.trackName, 'Shape of You');
});

test('scoreMatch rejects unrelated lyrics candidates', () => {
  const score = scoreMatch(
    { trackName: 'Other Song', artistName: 'Other Artist', plainLyrics: 'words' },
    { title: 'Numb', artist: 'Linkin Park', durationSeconds: 187 }
  );

  assert.ok(score < 70);
});
