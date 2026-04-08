# 🎵 Youtfly — Ad-Free Music Streaming Web App

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
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
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

## Deployment

- **Frontend**: Vercel (free) — `vercel deploy`
- **Backend**: Oracle Cloud Free Tier + PM2
- **Auto-update yt-dlp**: `0 0 * * 0 pip3 install -U yt-dlp`
