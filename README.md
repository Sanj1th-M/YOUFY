# 🎵 Youfy — Ad-Free Music Streaming Web App

Stream music for free, ad-free, powered by YouTube Music.

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in Firebase credentials in .env
node index.js
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Fill in Firebase + API URL in .env
npm run dev
```

Open http://localhost:5173

---

## Environment Variables

### backend/.env
```
PORT=3000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="<service-account-private-key-with-escaped-newlines>"
PUBLIC_BACKEND_URL=http://localhost:3000
PLAYLIST_IMPORT_ENABLED=false
PLAYLIST_IMPORT_ROLLOUT_PERCENT=10
PLAYLIST_IMPORT_ENCRYPTION_KEY=<32-byte-base64-or-hex-key>
REDIS_URL=redis://localhost:6379
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

### frontend/.env
```
VITE_API_URL=http://localhost:3000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## Requirements

- Node.js 18+
- Python 3 + yt-dlp: `pip install yt-dlp`
- Firebase project (free Spark plan)

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand |
| Audio | HTML5 Audio API (no YouTube player = no ads) |
| Backend | Node.js + Express |
| Extractor | yt-dlp (Python) + innertube fallback |
| Auth | Firebase Auth |
| Database | Firebase Firestore |
| Lyrics | lrclib.net (free) |
| Playlist Import | Spotify Web API + YouTube Data API v3 + BullMQ |

## Playlist Import

The playlist import system is isolated behind the `playlist_import_enabled` feature flag and a rollout percentage gate.

- Backend routes live under `/playlist-import`
- OAuth tokens are stored only on the backend and encrypted with AES-256-GCM
- Spotify uses Authorization Code with PKCE and the `playlist-read-private` scope
- YouTube Music import uses YouTube Data API v3 with the `https://www.googleapis.com/auth/youtube.readonly` scope
- Matching runs asynchronously through BullMQ when `REDIS_URL` is configured, with an in-process fallback for local development
- Imported tracks are written as normal Youfy playlists, so the existing playlist and player flows stay unchanged

## Deployment

- **Frontend**: Vercel (free) — `vercel deploy`
- **Backend**: Oracle Cloud Free Tier + PM2
- **Auto-update yt-dlp**: `0 0 * * 0 pip3 install -U yt-dlp`
