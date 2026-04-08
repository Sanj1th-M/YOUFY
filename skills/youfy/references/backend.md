# Youfy Backend — Full Node.js Reference

Runtime: Node.js >= 18 | Framework: Express.js | Language: CommonJS (require/module.exports)

---

## package.json

```json
{
  "name": "youfy-backend",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ytmusic-api": "^5.3.0",
    "axios": "^1.6.2",
    "firebase-admin": "^11.11.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.1.5",
    "morgan": "^1.10.0",
    "node-cache": "^5.1.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

## .env (NEVER commit — only commit .env.example)

```
PORT=3000
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR KEY\n-----END PRIVATE KEY-----\n"
```

---

## index.js — App Entry Point

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { globalLimiter } = require('./src/middleware/rateLimit');

const searchRoutes   = require('./src/routes/search');
const streamRoutes   = require('./src/routes/stream');
const lyricsRoutes   = require('./src/routes/lyrics');
const trendingRoutes = require('./src/routes/trending');
const playlistRoutes = require('./src/routes/playlist');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Youfy Backend' });
});

app.use('/search',   searchRoutes);
app.use('/stream',   streamRoutes);
app.use('/lyrics',   lyricsRoutes);
app.use('/trending', trendingRoutes);
app.use('/playlist', playlistRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Youfy backend running on port ${PORT}`));
```

---

## src/config/firebase.js

```javascript
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db   = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
```

---

## src/middleware/auth.js

```javascript
const { auth } = require('../config/firebase');

async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split('Bearer ')[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded; // { uid, email, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyToken };
```

---

## src/middleware/rateLimit.js

```javascript
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const streamLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Too many stream requests.' },
});

module.exports = { globalLimiter, streamLimiter };
```

---

## src/services/ytdlp.js

```javascript
const { execFile } = require('child_process');

function extractWithYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      [
        '--format', 'bestaudio',
        '--get-url',
        '--no-playlist',
        '--no-check-certificate',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        const url = stdout.trim();
        if (!url) return reject(new Error('yt-dlp returned empty URL'));
        resolve(url);
      }
    );
  });
}

// Innertube fallback (lightweight direct call)
async function extractWithInnertube(videoId) {
  const axios = require('axios');
  const body = {
    context: {
      client: { clientName: 'ANDROID_MUSIC', clientVersion: '5.29.52' },
    },
    videoId,
  };
  const res = await axios.post(
    'https://music.youtube.com/youtubei/v1/player?key=AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI',
    body,
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
  const formats = res.data?.streamingData?.adaptiveFormats || [];
  const audio   = formats.filter(f => f.mimeType?.startsWith('audio/')).sort(
    (a, b) => b.bitrate - a.bitrate
  );
  if (!audio.length) throw new Error('No audio format found via innertube');
  return audio[0].url;
}

async function getStreamUrl(videoId) {
  try {
    return await extractWithYtDlp(videoId);
  } catch (primaryErr) {
    console.warn('yt-dlp failed:', primaryErr.message, '— trying innertube fallback');
    try {
      return await extractWithInnertube(videoId);
    } catch (fallbackErr) {
      throw new Error('Both extractors failed for videoId: ' + videoId);
    }
  }
}

module.exports = { getStreamUrl };
```

---

## src/services/ytmusic.js

```javascript
const YTMusic = require('ytmusic-api');
const NodeCache = require('node-cache');

const cache   = new NodeCache({ stdTTL: 300 }); // 5 min cache
let ytmusic   = null;

async function getClient() {
  if (!ytmusic) {
    ytmusic = new YTMusic();
    await ytmusic.initialize();
  }
  return ytmusic;
}

async function searchAll(query) {
  const cacheKey = `search:${query}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const client = await getClient();
  const [songs, albums, artists] = await Promise.allSettled([
    client.searchSongs(query),
    client.searchAlbums(query),
    client.searchArtists(query),
  ]);

  const result = {
    songs:   songs.status   === 'fulfilled' ? songs.value   : [],
    albums:  albums.status  === 'fulfilled' ? albums.value  : [],
    artists: artists.status === 'fulfilled' ? artists.value : [],
  };
  cache.set(cacheKey, result);
  return result;
}

async function getTrending() {
  const cacheKey = 'trending';
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const client = await getClient();
  // ytmusic-api does not expose a trending endpoint natively;
  // use a generic popular query as a stand-in.
  const songs = await client.searchSongs('top hits 2024');
  cache.set(cacheKey, songs, 600); // 10 min
  return songs;
}

module.exports = { searchAll, getTrending };
```

---

## src/services/lrclib.js

```javascript
const axios = require('axios');

const BASE = 'https://lrclib.net/api';

async function getLyrics({ title, artist, album = '' }) {
  try {
    const params = { track_name: title, artist_name: artist };
    if (album) params.album_name = album;

    const { data } = await axios.get(`${BASE}/get`, { params, timeout: 8000 });

    return {
      synced: parseLrc(data.syncedLyrics || ''),
      plain:  data.plainLyrics || '',
    };
  } catch (err) {
    if (err.response?.status === 404) return { synced: [], plain: '' };
    throw err;
  }
}

// Parse LRC format into [{ time: seconds, text: string }]
function parseLrc(lrc) {
  if (!lrc) return [];
  return lrc
    .split('\n')
    .map(line => {
      const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
      if (!match) return null;
      const [, min, sec, text] = match;
      return {
        time: parseFloat(min) * 60 + parseFloat(sec),
        text: text.trim(),
      };
    })
    .filter(Boolean);
}

module.exports = { getLyrics };
```

---

## src/services/firestore.js

```javascript
const { db } = require('../config/firebase');

function playlistsRef(userId) {
  return db.collection('users').doc(userId).collection('playlists');
}

async function getPlaylists(userId) {
  const snap = await playlistsRef(userId).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createPlaylist(userId, name) {
  const ref = await playlistsRef(userId).add({
    name,
    songs:     [],
    createdAt: new Date(),
  });
  return { id: ref.id, name, songs: [], createdAt: new Date() };
}

async function updatePlaylist(userId, playlistId, data) {
  await playlistsRef(userId).doc(playlistId).update(data);
}

async function deletePlaylist(userId, playlistId) {
  await playlistsRef(userId).doc(playlistId).delete();
}

async function addSongToPlaylist(userId, playlistId, song) {
  const ref  = playlistsRef(userId).doc(playlistId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Playlist not found');
  const songs = snap.data().songs || [];
  if (songs.find(s => s.videoId === song.videoId)) return; // already exists
  songs.push(song);
  await ref.update({ songs });
}

async function removeSongFromPlaylist(userId, playlistId, videoId) {
  const ref  = playlistsRef(userId).doc(playlistId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Playlist not found');
  const songs = (snap.data().songs || []).filter(s => s.videoId !== videoId);
  await ref.update({ songs });
}

module.exports = {
  getPlaylists, createPlaylist, updatePlaylist,
  deletePlaylist, addSongToPlaylist, removeSongFromPlaylist,
};
```

---

## src/routes/search.js

```javascript
const router = require('express').Router();
const { search } = require('../controllers/searchController');
router.get('/', search);
module.exports = router;
```

## src/controllers/searchController.js

```javascript
const { searchAll } = require('../services/ytmusic');

async function search(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const results = await searchAll(q.trim());
    res.json(results);
  } catch (err) {
    next(err);
  }
}

module.exports = { search };
```

---

## src/routes/stream.js

```javascript
const router = require('express').Router();
const { streamLimiter } = require('../middleware/rateLimit');
const { stream } = require('../controllers/streamController');
router.get('/:videoId', streamLimiter, stream);
module.exports = router;
```

## src/controllers/streamController.js

```javascript
const { getStreamUrl } = require('../services/ytdlp');

async function stream(req, res, next) {
  try {
    const { videoId } = req.params;
    if (!videoId || videoId.length < 5) {
      return res.status(400).json({ error: 'Invalid videoId' });
    }
    const url = await getStreamUrl(videoId);
    res.json({ url });
  } catch (err) {
    next(err);
  }
}

module.exports = { stream };
```

---

## src/routes/lyrics.js

```javascript
const router = require('express').Router();
const { lyrics } = require('../controllers/lyricsController');
router.get('/', lyrics);
module.exports = router;
```

## src/controllers/lyricsController.js

```javascript
const { getLyrics } = require('../services/lrclib');

async function lyrics(req, res, next) {
  try {
    const { title, artist, album } = req.query;
    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }
    const result = await getLyrics({ title, artist, album });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { lyrics };
```

---

## src/routes/trending.js

```javascript
const router = require('express').Router();
const { trending } = require('../controllers/searchController');
router.get('/', trending);
module.exports = router;
```

Add `trending` to searchController.js:

```javascript
async function trending(req, res, next) {
  try {
    const { getTrending } = require('../services/ytmusic');
    const songs = await getTrending();
    res.json({ songs });
  } catch (err) {
    next(err);
  }
}
module.exports = { search, trending };
```

---

## src/routes/playlist.js

```javascript
const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/playlistController');

router.use(verifyToken); // all playlist routes require auth

router.get('/',                           ctrl.getPlaylists);
router.post('/',                          ctrl.createPlaylist);
router.put('/:id',                        ctrl.updatePlaylist);
router.delete('/:id',                     ctrl.deletePlaylist);
router.post('/:id/song',                  ctrl.addSong);
router.delete('/:id/song/:videoId',       ctrl.removeSong);

module.exports = router;
```

## src/controllers/playlistController.js

```javascript
const fs = require('../services/firestore');

async function getPlaylists(req, res, next) {
  try {
    const playlists = await fs.getPlaylists(req.user.uid);
    res.json({ playlists });
  } catch (err) { next(err); }
}

async function createPlaylist(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const playlist = await fs.createPlaylist(req.user.uid, name);
    res.status(201).json({ playlist });
  } catch (err) { next(err); }
}

async function updatePlaylist(req, res, next) {
  try {
    await fs.updatePlaylist(req.user.uid, req.params.id, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function deletePlaylist(req, res, next) {
  try {
    await fs.deletePlaylist(req.user.uid, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function addSong(req, res, next) {
  try {
    const { videoId, title, artist, thumbnail, duration } = req.body;
    if (!videoId || !title) return res.status(400).json({ error: 'videoId and title required' });
    await fs.addSongToPlaylist(req.user.uid, req.params.id,
      { videoId, title, artist, thumbnail, duration });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function removeSong(req, res, next) {
  try {
    await fs.removeSongFromPlaylist(req.user.uid, req.params.id, req.params.videoId);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { getPlaylists, createPlaylist, updatePlaylist,
                   deletePlaylist, addSong, removeSong };
```

---

## API Error Format

All errors return:
```json
{ "error": "descriptive message here" }
```

HTTP status codes used:
- `200` — success
- `201` — created
- `400` — bad request (missing/invalid params)
- `401` — unauthorized (missing/invalid token)
- `404` — not found
- `429` — rate limit exceeded
- `500` — internal server error
