<!--
This guide explains how YOUFY uses YouTube cookies for yt-dlp and how to refresh them safely.
-->

# YOUFY yt-dlp Cookie Setup

## Why YOUFY needs cookies

YOUFY streams audio from YouTube through `yt-dlp`. Over time, YouTube may rate-limit anonymous extraction or show bot checks. A valid logged-in browser session gives `yt-dlp` a more stable way to fetch stream URLs, which keeps playback working longer with less manual firefighting.

## Create a dedicated server Google account

Use a separate Google account only for the server, for example `youfy.server@gmail.com`. Do not reuse your personal account. This keeps browser cookies isolated, easier to rotate, and safer if the server ever needs to be rebuilt.

## Export `cookies.txt`

1. Install the Chrome extension `Get cookies.txt LOCALLY`.
2. Sign in to YouTube in the browser profile you want the backend to use.
3. Open `youtube.com`.
4. Use the extension to export cookies in Netscape `cookies.txt` format.
5. Save the file somewhere stable on the backend machine, for example `C:\Users\Sanjith\PROJECT\youfy\backend\cookies.txt`.

## Configure YOUFY

Set one of these in `backend/.env`:

- `YT_DLP_COOKIES=C:\Users\Sanjith\PROJECT\youfy\backend\cookies.txt`
- `YT_DLP_COOKIES_FROM_BROWSER=edge`

Use `YT_DLP_COOKIES` when you want predictable server-side behavior. Use `YT_DLP_COOKIES_FROM_BROWSER` only when the browser is installed on the same machine and you are comfortable with `yt-dlp` reading it directly.

## How YOUFY warns you

The backend runs a daily cookie freshness check. If `.youtube.com` cookies expire within 14 days, the logs warn you before playback breaks. If the cookies are already expired, the backend logs an error.

## Refresh procedure

1. Sign in to the dedicated Google account in the server browser.
2. Open `youtube.com` and confirm the session still works.
3. Re-export a new `cookies.txt` with `Get cookies.txt LOCALLY`.
4. Replace the old cookie file at the same path.
5. Restart the YOUFY backend.
6. Optionally hit `GET /health/stream` to confirm extraction still works.

## Important note

The browser cookies used by `yt-dlp` are completely separate from the user Google OAuth login inside the YOUFY app. End-user authentication and server-side YouTube extraction do not share accounts or tokens.
