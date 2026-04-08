---
name: youfy
description: >
  Master reference skill for the Youfy music streaming app project. Use this skill
  whenever the user asks to build, code, debug, plan, or discuss anything related to
  the Youfy app — including Flutter frontend, Node.js backend, yt-dlp audio extraction,
  Firebase auth/Firestore, audio playback, playlists, lyrics, deployment, or any part
  of the tech stack. Also trigger for questions like "how does ad-free work in Youfy",
  "write the stream controller", "set up Firebase", "create the audio handler", or
  "deploy to Oracle Cloud". If the user mentions Youfy, music streaming app, or any
  component of this stack in a coding/building context, always use this skill first
  before writing any code. Works the same in any coding assistant (Cursor, Claude Code,
  Codex, Antigravity, or others): load from the repo path below.
---

# Youfy — Master Skill Router

Youfy is a free, ad-free music streaming app (Android + iOS) built with Flutter +
Node.js. Audio is streamed from YouTube via yt-dlp — the YouTube player never loads,
so ads never inject.

---

## Where this skill lives (any coding assistant)

The canonical copy is in this repository at **`skills/youfy/`** (from the project root). Paths like `references/backend.md` are relative to that folder.

Use this material the same way in **Cursor**, **Claude Code**, **Codex**, **Antigravity**, or any other tool: open or attach `skills/youfy/SKILL.md` and the `references/` files when your product supports project skills, custom instructions, rules, or context files. If a product expects skills under its own directory, copy or symlink this folder there and keep the internal paths unchanged.

---

## ⚠️ ANTI-HALLUCINATION RULES — ALWAYS APPLY

1. **DO NOT** use `ytdl-core` — replaced by `yt-dlp` everywhere
2. **DO NOT** use WebView or YouTube iframe to play music — `just_audio` only
3. **DO NOT** store secrets in Flutter/Dart — all keys in backend `.env` only
4. **DO NOT** use Spotify, Apple Music, or any paid API — YouTube only
5. **DO NOT** suggest paid hosting — Oracle Cloud Free Tier only
6. **DO NOT** use GetX or BLoC — Riverpod only
7. **DO NOT** call YouTube directly from Flutter — always through the backend
8. **DO NOT** cache stream URLs > 5 hours — they expire in ~6 hrs
9. **DO NOT** use SQLite as main DB — Firestore is the database
10. If unsure — state it explicitly, never guess

---

## Reference Files — Read the Right One

Before writing any code or giving instructions, load the relevant reference file:

| Task / Topic | Read This File |
|---|---|
| Node.js routes, controllers, services, yt-dlp, ytmusic-api | `references/backend.md` |
| Flutter code — main.dart, models, providers, audio, screens | `references/flutter.md` |
| Firebase Auth, Firestore structure, security rules, free limits | `references/firebase.md` |
| Oracle Cloud setup, PM2, SSL, cron, UptimeRobot | `references/deployment.md` |
| System diagram, data flow, error patterns, feature checklist | `references/architecture.md` |

> Always read the matching reference file BEFORE generating code.
> For tasks spanning multiple areas (e.g. "wire up auth end-to-end"),
> read both relevant files (e.g. `firebase.md` + `flutter.md` + `backend.md`).

---

## Quick Stack Reference

| Layer | Technology |
|---|---|
| Mobile | Flutter (Dart) — Android + iOS |
| Backend | Node.js + Express (CommonJS) |
| Audio extractor | yt-dlp (Python) — NOT ytdl-core |
| Search | ytmusic-api |
| Lyrics | lrclib.net (free, no key) |
| Auth | Firebase Auth (email/password) |
| Database | Cloud Firestore |
| Local storage | Hive (Flutter) |
| State mgmt | Riverpod |
| Navigation | go_router |
| HTTP client | Dio |
| Audio playback | just_audio + audio_service |
| Hosting | Oracle Cloud Free Tier |
| Process manager | PM2 |
| Total cost | $0 forever |

---

## Build Phase Order

1. Backend foundation → `references/backend.md`
2. Backend services (yt-dlp, ytmusic, lyrics) → `references/backend.md`
3. Backend routes + controllers → `references/backend.md`
4. Flutter foundation (main, router, models) → `references/flutter.md`
5. Flutter services + audio handler → `references/flutter.md`
6. Flutter providers + screens → `references/flutter.md`
7. Firebase auth + Firestore → `references/firebase.md`
8. Deployment → `references/deployment.md`
