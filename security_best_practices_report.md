# Youfy OWASP Top 10 Security Review

Date: 2026-04-15  
Scope: `backend/`, `frontend/`, `firestore.rules`, dependency manifests, and project security configuration visible in this repository.  
Framework: Latest official OWASP Top 10:2025 categories, with occasional 2021 name notes where useful. Source: https://owasp.org/Top10/2025/

## Executive Summary

The application has several good baseline controls: protected playlist/recently-played routes use Firebase Bearer tokens, the backend uses Helmet, request body size limits, a CORS allowlist, general and auth rate limiting, and command execution for `yt-dlp` is done with `execFile`, argument arrays, video ID validation, and `--` argument separation.

The highest priority risks are supply-chain related. Production `npm audit --omit=dev` found critical backend advisories through `firebase-admin` / `protobufjs`, high/moderate frontend advisories through `firebase` / `undici`, and the backend also auto-updates `yt-dlp` at runtime with `pip install -U`. The main application-code issues are a mass-assignment bug in playlist updates, weak Firestore schema validation for client-writable recommendation data, missing visible frontend security headers/CSP, and one unauthenticated health endpoint returning raw operational errors.

## Remediation Update

Applied on 2026-04-15:

- Fixed YF-001 critical backend dependency exposure by upgrading `firebase-admin` to `13.8.0`, removing the unused direct `protobufjs` dependency, and updating `follow-redirects` to `1.16.0`.
- Fixed YF-002 frontend production dependency exposure by upgrading `firebase` to `11.10.0`; `npm audit --omit=dev` now reports 0 frontend production vulnerabilities.
- Left YF-003 unchanged by request: the runtime `yt-dlp` auto-update job remains in place.
- Fixed YF-004 by using route-specific playlist name validation and song payload validation, preventing broad `req.body` writes to playlist metadata.
- Fixed YF-005 by adding Firestore Rules field allowlists, type checks, length/range checks, timestamp checks, and YouTube video ID-shaped document IDs for `songInteractions`.
- Fixed YF-006 by adding `frontend/vercel.json` security headers for CSP, clickjacking protection, MIME sniffing, referrer policy, and permissions policy.
- Fixed YF-007 by making `/health/stream` return generic failure state while logging detailed errors server-side.
- Fixed YF-008 by replacing Vite `allowedHosts: true` with localhost defaults plus optional `VITE_ALLOWED_HOSTS`.
- Fixed secret scanning setup by adding `.secretlintignore` and changing fake private-key examples so `npm run secretlint` succeeds.

Residual notes:

- Backend `npm audit --omit=dev` still reports 8 low-severity advisories through the latest available `firebase-admin@13.8.0`. npm's proposed force fix is `firebase-admin@10.3.0`, a semver-major downgrade, so it was intentionally not applied.
- Full frontend audit still reports a development-only Vite/esbuild advisory that requires a breaking Vite major upgrade. The dev-server host exposure was mitigated in `vite.config.js`; production dependency audit is clean.

## Positive Controls Observed

- Backend security middleware is present: Helmet/CSP in `backend/index.js:21`, JSON and URL encoded body limits in `backend/index.js:70-71`, global rate limiting in `backend/index.js:73`, and `X-Powered-By` disabled in `backend/index.js:74`.
- Protected backend routes are gated by Firebase token verification in `backend/index.js:91-92` and `backend/src/middleware/auth.js:3-19`.
- Command execution for stream extraction is relatively hardened: `execFile` is used in `backend/src/services/ytdlp.js:6`, video IDs are revalidated in `backend/src/services/ytdlp.js:90-94`, and the final URL argument is separated with `--` in `backend/src/services/ytdlp.js:113-114`.
- No direct React raw HTML sinks were found in app source during grep for `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`, and `postMessage` handlers.
- No obvious hardcoded secrets were found by grep for common private-key/token/password patterns outside lockfiles. `npm run secretlint` is present but currently returns `Not found target files`, so it is not yet validating the repository by default.

## Findings

### YF-001: Critical production dependency advisories in backend

Severity: Critical  
OWASP: A03:2025 - Software Supply Chain Failures; also maps to A06:2021 - Vulnerable and Outdated Components  
Location:
- `backend/package.json:16` (`firebase-admin`)
- `backend/package.json:21` (`protobufjs`)
- `backend/package-lock.json:2455-2457` (`firebase-admin` resolved to 11.11.1)
- `backend/package-lock.json:4049-4051` (`protobufjs` resolved to 7.2.4)

Evidence:

```json
"firebase-admin": "^11.11.0",
"protobufjs": "^7.2.4"
```

`npm audit --omit=dev` in `backend/` reported 9 production vulnerabilities: 4 critical, 1 moderate, and 4 low. The critical path includes `protobufjs` prototype pollution (`>=7.0.0 <7.2.5`) and vulnerable transitive Google packages through `firebase-admin`. The audit suggested upgrading `firebase-admin` to `13.8.0`, which is a semver-major change.

Impact: A remotely reachable vulnerable parser or Google/Firebase client path could lead to prototype pollution, denial of service, or worse depending on exploit reachability through the dependency stack.

Fix:

- Upgrade `firebase-admin` to the current supported major version and regression-test Firebase Auth, Firestore Admin writes, and emulator/local startup.
- Upgrade or remove the direct `protobufjs` dependency if not needed by application code.
- Add a CI gate such as `npm audit --omit=dev --audit-level=high` for backend production dependencies.

Mitigation:

- Keep lockfiles committed and deploy with `npm ci`.
- Track semver-major upgrade notes for Firebase Admin SDK before production rollout.

False positive notes:

- `npm audit` reports advisories based on dependency presence and known vulnerable ranges. Confirm exploit reachability for your exact runtime paths, but the production backend should still be upgraded because the severity and library exposure are high.

### YF-002: High and moderate production dependency advisories in frontend

Severity: High  
OWASP: A03:2025 - Software Supply Chain Failures; also maps to A06:2021 - Vulnerable and Outdated Components  
Location:
- `frontend/package.json:17` (`firebase`)
- `frontend/package-lock.json:3539-3541` (`firebase` resolved to 10.14.1)
- `frontend/package-lock.json:6328-6330` (`undici` resolved to 6.19.7)
- `frontend/package-lock.json:3618-3620` (`follow-redirects` resolved to 1.15.11)

Evidence:

```json
"firebase": "^10.7.0"
```

`npm audit --omit=dev` in `frontend/` reported 11 production vulnerabilities: 1 high and 10 moderate. The high advisory chain is through `undici` under Firebase packages, with additional moderate advisories in Firebase package ranges and `follow-redirects`.

Impact: Frontend build/runtime dependencies include known vulnerable HTTP client code paths. Some issues may only be reachable in Node-side tooling or package internals, but the dependency tree is still outside a clean production posture.

Fix:

- Upgrade `firebase` to a patched version and rebuild/test login, auth state persistence, Firestore recommendation reads/writes, and production build.
- Update `axios` / transitive `follow-redirects` where the lockfile still resolves to an advised range.
- Add frontend `npm audit --omit=dev --audit-level=high` to CI.

Mitigation:

- Prefer `npm ci` for reproducible builds.
- Avoid publishing source maps publicly unless intentionally configured for error-reporting access.

False positive notes:

- Some Firebase transitive packages may not be shipped into the final browser bundle or may be used only in limited paths. Treat this as dependency hygiene requiring upgrade and verification, not proof of an active remote exploit in the UI.

### YF-003: Runtime auto-update of `yt-dlp` mutates production dependencies

Severity: High  
OWASP: A03:2025 - Software Supply Chain Failures; A08:2025 - Software or Data Integrity Failures  
Location:
- `backend/src/services/ytdlpUpdater.js:51-58`
- `backend/src/services/ytdlpUpdater.js:136-140`

Evidence:

```js
await execFileAsync('pip', ['install', '-U', 'yt-dlp', '--break-system-packages']);
await execFileAsync('python', ['-m', 'pip', 'install', '-U', 'yt-dlp', '--break-system-packages']);
cron.schedule('0 3 * * 0', () => {
```

Impact: The production server periodically installs whatever version PyPI currently serves. A compromised package, dependency confusion event, malicious mirror, or simply a breaking upstream release can change executable code on the server outside code review, lockfile control, and deployment rollback.

Fix:

- Remove runtime package upgrades from the application process.
- Move `yt-dlp` updates into CI/CD or a controlled server maintenance job that pins versions, records the deployed version, and can be rolled back.
- Prefer a lockfile or image build step, then deploy immutable artifacts.

Mitigation:

- If automatic updates must remain, pin to a vetted version, verify hashes/signatures where available, run under a least-privileged user, and alert on update results.

False positive notes:

- Auto-updating extractors is operationally useful for YouTube breakage. The security issue is doing it inside the production app process with an unpinned network install.

### YF-004: Playlist update endpoint allows mass assignment of server-controlled fields

Severity: Medium  
OWASP: A01:2025 - Broken Access Control; A06:2025 - Insecure Design  
Location:
- `backend/src/middleware/validate.js:36-51`
- `backend/src/routes/playlist.js:33-38`
- `backend/src/services/firestore.js:86-88`

Evidence:

```js
function validatePlaylistBody(req, res, next) {
  if (req.body.name) {
    req.body.name = sanitizeString(req.body.name, 100);
  }
  if (req.body.videoId || req.body.title) {
    req.body = {
      videoId: sanitizeString(req.body.videoId || '', 20),
      // ...
    };
  }
  next();
}

r.put('/:id', validatePlaylistBody, async (req, res) => {
  // ...
  try { await fs.updatePlaylist(req.user.uid, id, req.body); res.json({ success: true }); }
```

An authenticated user can send arbitrary playlist fields in the update body when the body does not contain `videoId` or `title`, for example `systemKey`, `songs`, or future server-controlled fields.

Impact: Today this is mostly self-owned data tampering, such as marking a normal playlist as a system playlist and blocking future update/delete behavior. The pattern becomes more serious if future privileged fields are added because the endpoint already writes unsafely broad client input.

Fix:

- Use route-specific validation. For `PUT /playlist/:id`, accept only `{ name }` and reject unknown keys.
- Keep song payload validation separate from playlist metadata validation.
- In `updatePlaylist`, construct the Firestore update object explicitly instead of passing `req.body`.

Mitigation:

- Add backend tests proving `systemKey`, `createdAt`, `songs`, and unknown fields cannot be modified through the playlist update route.

False positive notes:

- Access is correctly scoped to `req.user.uid`, so this is not a cross-user IDOR based on the reviewed code.

### YF-005: Firestore client-write rules lack schema, type, and size validation

Severity: Medium  
OWASP: A01:2025 - Broken Access Control; A06:2025 - Insecure Design  
Location:
- `firestore.rules:8-10`
- `frontend/src/utils/recommendationEngine.js:103`
- `frontend/src/utils/recommendationEngine.js:131-162`

Evidence:

```js
match /users/{userId}/songInteractions/{docId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == userId;
}
```

The frontend writes recommendation interaction documents directly:

```js
const docRef = doc(db, 'users', userId, 'songInteractions', videoId);
await setDoc(docRef, updatePayload, { merge: true });
```

Impact: Any authenticated client can write arbitrary fields and values to its own recommendation interaction documents. This does not expose other users, but it allows data integrity issues, oversized/costly document writes within Firestore limits, analytics pollution, and future risk if these documents become trusted by other backend workflows.

Fix:

- Add Firestore rules that allow only expected keys such as `videoId`, `title`, `artist`, `genre`, `thumbnail`, `songDuration`, `score`, `playCount`, `totalListenTime`, `liked`, `skipped`, `addedToPlaylist`, `createdAt`, and `lastPlayed`.
- Validate types, maximum string lengths, numeric ranges, and document ID format.
- Separate create and update rules so immutable fields cannot be changed after creation.

Mitigation:

- Move recommendation writes behind the backend if you need server-authoritative scoring.

False positive notes:

- The rule correctly enforces `request.auth.uid == userId`, so this is a schema/integrity weakness, not a cross-user data leak.

### YF-006: Frontend security headers and CSP are not visible in repository config

Severity: Medium  
OWASP: A02:2025 - Security Misconfiguration  
Location:
- `frontend/index.html:1-14`
- Repository search found no Vercel/static hosting header configuration for CSP, `frame-ancestors`/`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

Evidence:

```html
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

The backend uses Helmet in `backend/index.js:21-44`, but the README describes frontend deployment on Vercel. If the React app is served by Vercel, the backend Helmet headers do not protect the SPA shell unless traffic is actually proxied through the backend.

Impact: If the hosting edge does not set browser security headers, the app has weaker defense-in-depth against XSS impact, clickjacking, MIME sniffing, overly broad referrer leakage, and unnecessary browser capability exposure.

Fix:

- Add hosting-edge headers, for example through `vercel.json` or the deployment platform equivalent.
- Start CSP in report-only if needed, then enforce. A realistic initial policy should allow this app's API, Firebase endpoints, Google image domains, YouTube thumbnail/media domains, and block framing.

Mitigation:

- At minimum, verify production response headers with `curl -I https://<frontend-host>` and document where headers are managed.

False positive notes:

- Headers may already exist in Vercel dashboard/CDN configuration that is not committed here. This report can only verify what is visible in the repo.

### YF-007: Unauthenticated stream health endpoint returns raw operational errors

Severity: Low  
OWASP: A10:2025 - Mishandling of Exceptional Conditions; also relates to A02:2025 - Security Misconfiguration  
Location:
- `backend/src/routes/health.js:24-57`
- `backend/src/routes/health.js:45-47`

Evidence:

```js
const payload = {
  status: 'broken',
  error: error.message,
};
```

Impact: Anyone who can reach `/health/stream` can learn exact stream-extraction failures, library messages, bot-blocking state, or other operational details. This is low severity, but it gives attackers useful signal and creates unnecessary information disclosure.

Fix:

- Return a generic client message such as `{ status: 'broken' }`.
- Log the detailed `error.message` server-side only.
- Consider protecting deep health probes behind an admin token or exposing only a shallow public `/health`.

Mitigation:

- Keep cooldown behavior in `backend/src/routes/health.js:24-27`, which already reduces abuse.

False positive notes:

- This endpoint intentionally checks operational stream health. The finding is about returning internal error details, not the existence of the health check.

### YF-008: Vite development server allows all hostnames

Severity: Low  
OWASP: A02:2025 - Security Misconfiguration  
Location:
- `frontend/vite.config.js:6-9`

Evidence:

```js
server: {
  port: 5173,
  allowedHosts: true,
```

Impact: If the Vite dev server is exposed beyond localhost, accepting arbitrary hosts can increase DNS rebinding and unintended LAN exposure risk. This is generally a development-only risk, but it matters if demos or tunnels are used.

Fix:

- Restrict `allowedHosts` to `localhost`, `127.0.0.1`, and any explicitly used tunnel/demo host.
- Do not expose the Vite dev server directly to untrusted networks.

Mitigation:

- Use production builds for public demos instead of the dev server.

False positive notes:

- This is not a production issue if Vite dev server never leaves the developer machine.

## OWASP Top 10:2025 Coverage Matrix

| OWASP 2025 category | Result in this codebase |
|---|---|
| A01 Broken Access Control | Protected backend user data routes use Firebase Bearer auth and `req.user.uid`. Main finding is mass assignment on playlist updates and weak Firestore client-write schema validation, not cross-user IDOR. |
| A02 Security Misconfiguration | Frontend security headers/CSP are not visible in repo config; Vite `allowedHosts: true` is a dev-server misconfiguration. Backend has good baseline Helmet/body-limit/error-handler controls. |
| A03 Software Supply Chain Failures | Critical backend audit findings, high/moderate frontend audit findings, and runtime `yt-dlp` auto-update are the top risks. |
| A04 Cryptographic Failures | No hardcoded private keys or app-managed crypto were found. Firebase web config is public by design, but backend private key must remain in environment/secret manager. |
| A05 Injection | No SQL layer was found. Command execution for `yt-dlp` is hardened with `execFile`, regex video ID validation, URL domain validation, and argument separation. No direct React HTML/eval sinks were found. |
| A06 Insecure Design | Direct client-write recommendation data has weak schema validation; public stream extraction is rate limited but should be monitored for abuse. |
| A07 Authentication Failures | Backend token verification is present. Email/password auth is handled directly by Firebase on the frontend, so password policy, MFA, abuse protection, and enumeration controls must be verified in Firebase project settings. |
| A08 Software or Data Integrity Failures | Runtime unpinned `yt-dlp` installation and playlist mass assignment are integrity risks. |
| A09 Security Logging and Alerting Failures | Basic server logging exists, but no security alerting/metrics are visible for rate-limit spikes, auth failures, dependency audit failures, or suspicious Firestore write patterns. |
| A10 Mishandling of Exceptional Conditions | `/health/stream` returns raw `error.message`; the central Express error handler is otherwise production-safe. |

## Recommended Fix Order

1. Upgrade backend production dependencies, especially `firebase-admin` and direct `protobufjs`, then run backend smoke tests.
2. Upgrade frontend `firebase`/HTTP-client transitive dependencies and rebuild/test auth plus Firestore recommendation flows.
3. Remove or redesign runtime `yt-dlp` auto-update into pinned CI/CD or controlled maintenance.
4. Fix playlist update mass assignment with route-specific allowlists and tests.
5. Harden Firestore rules with field/type/size validation for `songInteractions`.
6. Add and verify frontend security headers/CSP at the hosting edge.
7. Stop returning raw errors from `/health/stream`.
8. Restrict Vite `allowedHosts` for development safety.

## Commands Run

- `npm audit --omit=dev --json` in repository root: 0 production vulnerabilities.
- `npm audit --omit=dev --json` in `backend/`: 9 production vulnerabilities (4 critical, 1 moderate, 4 low).
- `npm audit --omit=dev --json` in `frontend/`: 11 production vulnerabilities (1 high, 10 moderate).
- `npm run secretlint`: failed with `Error: Not found target files`.
- Grep searches for common backend sinks: `child_process`, redirects, CORS, Helmet, auth, body parsers, static file serving, outbound requests, and route declarations.
- Grep searches for frontend sinks: `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`, `postMessage`, unsafe navigation, web storage, and auth token handling.
