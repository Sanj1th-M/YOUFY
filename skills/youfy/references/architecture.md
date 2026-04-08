# Youfy Architecture — System Design, Data Flow & Feature Checklist

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FLUTTER APP                                │
│                     (Android + iOS — Dart)                          │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Search  │  │  Player  │  │ Library  │  │  Auth (Firebase) │   │
│  │ Screen   │  │ Screen   │  │ Screen   │  │  Login/Register  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                 │             │
│  ┌────▼──────────────▼──────────────▼─────────────┐  │             │
│  │              Riverpod Providers                 │  │             │
│  │  search · player · lyrics · playlist · auth    │  │             │
│  └────────────────────┬────────────────────────────┘  │             │
│                       │                               │             │
│  ┌────────────────────▼────────────────────────────┐  │             │
│  │               ApiService (Dio)                  │  │             │
│  │  baseUrl: https://yourdomain.com                │  │             │
│  │  Auto-injects Firebase Bearer token             │  │             │
│  └────────────────────┬────────────────────────────┘  │             │
│                       │                               │             │
│  ┌────────────────────▼────────────────────────────┐  │             │
│  │           YoufyAudioHandler                     │  │             │
│  │  just_audio + audio_service                     │  │             │
│  │  Background playback + lock screen controls     │  │             │
│  └─────────────────────────────────────────────────┘  │             │
│                                                        │             │
│  Local: Hive (song metadata cache, NOT stream URLs)   │             │
└────────────────────────────────────────────────────────┼─────────────┘
                         │ HTTPS                         │ Firebase SDK
                         ▼                               ▼
┌──────────────────────────────────┐     ┌──────────────────────────────┐
│       NODE.JS BACKEND            │     │         FIREBASE             │
│    (Oracle Cloud — Ubuntu 22.04) │     │       (Google Cloud)         │
│                                  │     │                              │
│  Express + PM2 + Nginx + SSL     │     │  ┌──────────────────────┐   │
│                                  │     │  │  Firebase Auth       │   │
│  Routes:                         │     │  │  (email/password)    │   │
│  GET  /search?q=                 │     │  └──────────────────────┘   │
│  GET  /stream/:videoId           │     │  ┌──────────────────────┐   │
│  GET  /lyrics?title=&artist=     │     │  │  Cloud Firestore     │   │
│  GET  /trending                  │     │  │  users/{uid}/        │   │
│  CRUD /playlist (auth required)  │     │  │    playlists/        │   │
│                                  │     │  └──────────────────────┘   │
│  Middleware:                     │     └──────────────────────────────┘
│  - Firebase JWT verification     │
│  - Rate limiting (100/15min)     │
│  - Morgan logging                │
│                                  │
│  Services:                       │
│  ┌──────────────────────────────┐│
│  │  ytmusic-api                 ││──► YouTube Music (search)
│  │  (search + trending)         ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  yt-dlp (Python)             ││──► YouTube (raw audio URL)
│  │  PRIMARY audio extractor     ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  Innertube API               ││──► YouTube (fallback)
│  │  FALLBACK if yt-dlp fails    ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  lrclib.net                  ││──► Lyrics API (free)
│  │  (synced + plain lyrics)     ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
```

---

## Ad-Free Audio Flow (The Core Mechanism)

```
Normal YouTube:
  User → YouTube Player → Ads injected → Music plays
  ↑ Ads are part of the PLAYER, not the audio file

Youfy:
  User taps song
    → Flutter calls GET /stream/:videoId
    → Backend runs: yt-dlp --format bestaudio --get-url
    → yt-dlp returns raw .m4a/.webm CDN URL
    → Backend returns { url: "https://..." }
    → Flutter's just_audio loads the raw URL directly
    → YouTube PLAYER never loads → NO ADS EVER
```

---

## Data Flow: Playing a Song

```
1. User taps song in SearchScreen
   │
2. playerProvider.playSong(song) is called
   │
3. ApiService.getStreamUrl(videoId)
   → GET /stream/:videoId
   │
4. Backend: yt-dlp extracts raw audio URL
   → returns { url: "https://rr1---sn-xxx.googlevideo.com/..." }
   │
5. YoufyAudioHandler.playFromUrl(url, mediaItem)
   → just_audio loads URL
   → audio_service registers with OS media system
   │
6. OS shows lock screen controls + notification
   │
7. LyricsView subscribes to positionStream
   → highlights active lyric line in real-time
   │
8. Stream URL expires in ~6 hrs
   → User presses play again → fresh URL fetched automatically
```

---

## Data Flow: Auth

```
Register:
  Flutter → FirebaseAuth.createUser(email, pass)
  → Firebase creates account → returns User
  → User is now logged in

Login:
  Flutter → FirebaseAuth.signIn(email, pass)
  → Firebase validates → returns User + ID token
  → Dio interceptor auto-attaches token to all requests

Protected API calls:
  Flutter ApiService → Authorization: Bearer <token>
  → Backend middleware.verifyToken()
  → admin.auth().verifyIdToken(token) → decoded { uid }
  → req.user.uid used to scope Firestore access

Logout:
  Flutter → FirebaseAuth.signOut()
  → authStateProvider emits null
  → GoRouter redirects to /login
```

---

## Data Models

### Song (used in search results, playlists, now playing)
```
{
  videoId:   String   // YouTube video ID (e.g. "dQw4w9WgXcQ")
  title:     String   // "Never Gonna Give You Up"
  artist:    String   // "Rick Astley"
  thumbnail: String?  // CDN URL to thumbnail image
  duration:  int?     // seconds (e.g. 213)
}
```

### Playlist (stored in Firestore)
```
{
  id:        String     // Firestore document ID
  name:      String     // "My Favourites"
  createdAt: DateTime
  songs:     List<Song>
}
```

### LyricLine (parsed from LRC format)
```
{
  time: double  // seconds (e.g. 12.34)
  text: String  // "Never gonna give you up"
}
```

### API Response — Search
```json
{
  "songs":   [ { "videoId": "...", "title": "...", "artist": "...", "thumbnail": "...", "duration": 213 } ],
  "albums":  [ { "albumId": "...", "name": "...", "artist": "...", "thumbnail": "..." } ],
  "artists": [ { "artistId": "...", "name": "...", "thumbnail": "..." } ]
}
```

### API Response — Stream
```json
{ "url": "https://rr1---sn-xxx.googlevideo.com/..." }
```
> This URL expires in ~6 hours. Always fetch fresh before playing.

### API Response — Lyrics
```json
{
  "synced": [ { "time": 12.34, "text": "Never gonna give you up" }, ... ],
  "plain":  "Never gonna give you up\nNever gonna let you down\n..."
}
```

---

## Error Handling Patterns

### Backend — All errors follow this shape
```json
{ "error": "descriptive message here" }
```

### HTTP Status Codes
| Code | Meaning | When |
|---|---|---|
| 200 | OK | Success |
| 201 | Created | Playlist created |
| 400 | Bad Request | Missing/invalid params |
| 401 | Unauthorized | Missing/invalid Firebase token |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled exception |

### Flutter — Dio error handling
```dart
try {
  final result = await apiService.search(query);
} on DioException catch (e) {
  switch (e.response?.statusCode) {
    case 401:
      // Token expired — force re-login
      ref.read(authServiceProvider).signOut();
    case 429:
      // Rate limited — show "try again" message
    case 500:
      // Backend error — show generic error
    default:
      if (e.type == DioExceptionType.connectionTimeout) {
        // No internet / server unreachable
      }
  }
}
```

### Stream URL Failure — Fallback Chain
```
yt-dlp fails
  → try Innertube API fallback
  → if both fail → return 500 to Flutter
  → Flutter shows "Playback failed, try again"
```

---

## Security Architecture Summary

| Threat | Protection |
|---|---|
| Unauthorized API access | Firebase JWT on all protected routes |
| API abuse / scraping | express-rate-limit (100 req / 15 min / IP) |
| Exposed secrets | `.env` only — never in Flutter or git |
| Man-in-middle attacks | HTTPS + Let's Encrypt SSL |
| Playlist data theft | Firestore rules: `uid == userId` |
| Server crashes | PM2 auto-restart |
| Downtime detection | UptimeRobot pings every 5 min |
| yt-dlp breaking | Weekly auto-update + Innertube fallback |

---

## Feature Checklist

### Core Features
- [ ] User registration (email + password)
- [ ] User login / logout
- [ ] Search songs, albums, artists
- [ ] Play song (ad-free audio stream)
- [ ] Background playback (Android + iOS)
- [ ] Lock screen media controls
- [ ] Synced lyrics (LRC format, line-by-line highlight)
- [ ] Plain text lyrics fallback
- [ ] Create playlist
- [ ] Add song to playlist
- [ ] Remove song from playlist
- [ ] Delete playlist
- [ ] View all playlists
- [ ] Trending / home feed
- [ ] Mini player (persistent bottom bar)

### Quality of Life
- [ ] Shimmer loading skeletons
- [ ] Error states with retry button
- [ ] Offline message when no internet
- [ ] Smooth page transitions (go_router)
- [ ] Album art dominant color theming (palette_generator)
- [ ] Song metadata cached in Hive (titles, thumbnails)
- [ ] Swipe to remove song from playlist (flutter_slidable)

### Not in Scope
- ❌ Offline download / caching of audio
- ❌ Social features (follow, share)
- ❌ Video playback
- ❌ Ads of any kind
- ❌ Paid features

---

## Long-Term Reliability Factors (4–5 Year Target)

| Component | Why It Will Last |
|---|---|
| yt-dlp | Updated almost daily; open source; Google cannot permanently block it |
| ytmusic-api | Existed since 2021; unofficial YT Music API has been stable |
| Firebase | Google's own product; free tier guaranteed long-term; millions of apps depend on it |
| Oracle Cloud | Always Free is permanent policy, not a promotion |
| just_audio | Most popular Flutter audio package; actively maintained by community |
| lrclib.net | Open source; no API key = no expiry; community-run |
| Let's Encrypt | Non-profit; industry standard; auto-renews |
