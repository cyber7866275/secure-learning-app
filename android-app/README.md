# SecureLearn — Android App (Stage 5)

Kotlin + Jetpack Compose app for the secure learning platform. Clean + MVVM,
Hilt DI, Navigation Compose, Retrofit + OkHttp, Media3 ExoPlayer for video.

## 1. Open in Android Studio

**Prerequisites:** Android Studio Hedgehog (or newer), JDK 17, Android SDK
with **compileSdk 34**.

1. `File → Open…` and select the `android-app/` folder.
2. Let Gradle sync finish (first sync downloads the Android Gradle Plugin,
   Kotlin, Compose BOM, Hilt, Retrofit… — needs internet).

## 2. Point the app at your backend (`BASE_URL`)

The base URL is a `BuildConfig` field resolved in this order:

1. `local.properties` → `api.baseUrl` (recommended; not committed)
2. env var `API_BASE_URL`
3. default `http://10.0.2.2:3000` (Android emulator → your machine's localhost)

```bash
cp local.properties.example local.properties
# edit api.baseUrl — emulator: http://10.0.2.2:3000
# physical device on same Wi-Fi: https://<your-lan-ip>:3000
```

Then **Sync Project with Gradle Files** (or Rebuild) so `BuildConfig.BASE_URL`
regenerates. The backend must be running first:

```bash
cd ../backend
docker compose up -d
npx prisma migrate dev --name init   # first time only (Stage 2/3 fold in)
npm run seed && npm run start:dev
```

> HTTPS: the manifest sets `usesCleartextTraffic="false"`. For local
> development there is a narrow exception for `10.0.2.2` only
> (`res/xml/network_security_config.xml`). Use HTTPS for any real deployment.

## 3. Run / build

- **Run on emulator:** `Run → Run 'app'` (or Shift+F10). Create a Pixel
  device with API 30+ in Device Manager if you don't have one.
- **Debug APK:** `Build → Build Bundle(s) / APK(s) → Build APK(s)` →
  `app/build/outputs/apk/debug/app-debug.apk`.
- **Release APK:** `Build → Generate Signed Bundle / APK…` → create/use your
  keystore → APK. Release enables R8 (`proguard-rules.pro` keeps Retrofit
  DTOs/Hilt). **Keep the keystore + passwords safe — losing them means you
  can never update the Play listing.**

> Note: the Gradle wrapper jar is intentionally not bundled in this repo.
> Android Studio supplies Gradle itself, so the steps above just work. If you
> want a CLI build outside Android Studio, generate the wrapper once with a
> local Gradle 8.7+: `gradle wrapper --gradle-version 8.7` inside
> `android-app/`, then `./gradlew assembleDebug`.

## 4. Feature map (Stage 4)

| Screen | What it does |
|---|---|
| Splash | Loads feature flags (`GET /settings`), routes to Home/Login |
| Login | Phone+OTP tab (E.164, 6-digit, resend timer) / Email tab |
| Home | Banners carousel, categories, recently added PDFs |
| Library | Search + category filter + pagination, tap → secure viewer |
| Videos | Video list (title + duration); tap → secure HLS player |
| Profile | User info, device list, logout |
| PDF Viewer | Secure viewer (see below) |
| Video Player | Secure HLS player (see below) |

## 5. Secure PDF viewer — how it works

1. `POST /pdfs/:id/access` → backend checks (published? device valid?
   permission granted?) → returns a **5-minute presigned URL**.
2. App downloads to an **app-private temp file** (`cacheDir`, `MODE_PRIVATE`).
3. `PdfRenderer` renders each page to a **Bitmap** — no text layer exists, so
   text selection/copy is impossible by construction. No long-press handlers.
4. `FLAG_SECURE` is set app-wide in `MainActivity` → OS screenshots and
   screen recordings render black.
5. `WatermarkOverlay`: `NAME • USER ID • date/time`, semi-transparent,
   jumps to a random position **every 25 seconds** (toggleable from the
   admin panel → Settings).
6. On close (or ViewModel cleared): temp file is **zero-overwritten then
   deleted** (`secureDelete`). Partial downloads are wiped on failure.
7. If the download 403s (URL expired), the viewer requests a fresh access
   URL once and retries.

There is intentionally **no** share / print / download / "open with"
affordance anywhere in the app.

## 6. Secure video player (Stage 5) — how it works

1. `POST /videos/:id/access` → backend runs the full gate (published? video
   `READY`? device valid? permission granted?) → returns the **authorized
   HLS master-manifest URL** (not a file URL — none exists for clients).
2. ExoPlayer (`HlsMediaSource` + authenticated OkHttp data source) loads the
   master with the Bearer <redacted> Variant sub-requests carry a **10-minute
   HMAC token** instead (ExoPlayer can't attach per-URL auth headers).
3. Segments are **AES-128 encrypted**; the key and segments arrive as
   short-lived presigned URLs the server rewrites on every request.
   This is AES-128 — not Widevine DRM. The Widevine upgrade path (license
   provider → `DrmSessionManager` hook in `VideoPlayerViewModel`) is
   documented in the backend's `video-processing` module, not faked.
4. **No offline download**: no cache/DownloadManager is configured; the
   stock PlayerView controller has no download button.
5. Same protections as the PDF viewer: app-wide `FLAG_SECURE` (screenshots /
   screen recordings render black) and the moving `WatermarkOverlay`
   (`NAME • USER ID • date/time`, jumps every 25 s) above the video surface.
6. Player is released when the ViewModel is cleared; playback pauses when
   leaving the screen.

## 7. Analytics (Stage 6) — how it works

The app reports playback/reading engagement to `POST /analytics/events`
(JWT-guarded, throttled ~60/min on the backend). Only the backend-whitelisted
event types are ever sent — anything else is dropped client-side.

**What is tracked**

| Event | When | Payload |
|---|---|---|
| `content_open` | PDF finishes opening (renderer ready) | `pdf` + id |
| `pdf_close` | PDF viewer ViewModel cleared | `pdf` + id |
| `video_play` | playback actually starts / resumes (buffering stalls excluded) | `video` + id |
| `video_pause` | user pauses (not on buffering) | `video` + id + `positionSec` |
| `video_heartbeat` | every 30 s while playing | `video` + id + `positionSec` |
| `video_complete` | playback reaches the end | `video` + id + `durationSec` |

**Batching / offline behavior**

Events are appended as JSON lines to `cacheDir/analytics_queue.jsonl`
(`AnalyticsReporter` — synchronized, crash-safe, malformed lines skipped,
capped at 1000 events with oldest-first eviction). A unique WorkManager job
(`analytics-upload`, every 15 min, `NetworkType.CONNECTED`) uploads up to 200
events per run via the authenticated Retrofit client; only lines the server
acks (HTTP 2xx → `{ received: n }`) are removed — the rest stay queued for
the next run. Offline devices simply keep queueing; nothing is lost and no
new Android permissions were added. `track()` never throws into the UI.

**Verify end-to-end**

1. Run the app, open a PDF, then play a video for ~40 s (one heartbeat).
2. Force the upload: Android Studio → `View → Tool Windows → App
   Inspection → Background Task Inspector` → find `analytics-upload` →
   run it now — or just wait up to 15 min.
3. Open the admin panel → **Security / Analytics dashboard** → opens, plays,
   and watch time appear. (The backend ingests the batch within the request;
   the dashboard reads the same store.)

## 8. Manual security test plan

Run the backend + admin panel, create a user, upload + publish a PDF, grant
the user permission, then:

1. **Open a PDF** → pages render, page indicator works.
2. **Screenshot** (power + volume-down) → image must be **fully black**.
3. **Screen recording** → recorded video must be **black** where the app is.
4. **Long-press on text** → no selection handles, no copy menu.
5. **Watermark** → shows your name + user ID + timestamp; watch ~30s → it
   **moves** to a new random position.
6. **Temp file cleanup** → open a PDF, go back, then in Android Studio
   `View → Tool Windows → Device File Explorer` →
   `/data/data/com.securelearn.app/cache/` → no `secure_*.tmp` files remain.
7. **URL expiry** → open a PDF, wait 6+ minutes… (simpler: from logcat copy
   isn't possible — instead) revoke the permission in the admin panel, then
   reopen → you must get an access error, not the document.
8. **Device limit** → log in on a second emulator; per backend settings the
   oldest session is revoked (or login denied).
9. **Logout** → tokens are wiped; relaunching the app lands on Login.

### Video tests (Stage 5)

Backend first: upload a video in the admin panel (Content → Videos →
upload). The in-process worker picks it up within ~30 s, runs ffmpeg, and
the row flips `PENDING → PROCESSING → READY` (watch it auto-update on
reload). If it lands on `FAILED`, the error shows in the row and **Reprocess**
re-queues it. Then publish the video and grant the test user permission.

1. **Videos tab** → shows title + duration (e.g. `12:05`), no thumbnails.
2. **Tap a video** → player opens, spinner, then playback starts.
3. **Seeking / quality** → the stock controller works; ExoPlayer adapts
   between 1080p/720p/480p automatically.
4. **Watermark over video** → your name + user ID + timestamp floats above
   the playing video; watch ~30 s → it moves.
5. **Screenshot / screen recording** → black, same as the PDF viewer.
6. **Permission revoked mid-session** → revoke in the admin panel, reopen
   the video → access error, not the stream.
7. **Token expiry** → start a video, wait 10+ minutes, seek or change
   quality (forces a fresh variant fetch) → if the HLS token expired, the
   player shows an error; tapping **Retry** fetches a fresh manifest URL.
8. **No downloads** → there is no download button; Device File Explorer shows
   no video files under the app's private dirs after playback.
9. **Back out** → player is released (no audio continues in background).

### Device integrity tests (Stage 7)

How it works: the app runs a RootBeer check (cached per process) and requests
a Play Integrity token at login; both ride along in the login/OTP/register
calls (`integrityToken`, `rooted`). The server is the authoritative enforcer —
it writes `ROOT_DETECTED` / `INTEGRITY_FAILED` alerts and blocks per the
`root_block_enabled` / `integrity_enforcement` settings. Certificate pinning
is active in **release** builds only, from `api.certPins` in
`local.properties` (debug builds skip pinning so local HTTP servers work).

1. **Root block (emulator)** → most emulators trip RootBeer: with
   `root_block_enabled=true` (default), login shows "This device appears to be
   rooted…". Admin panel → `/security` shows a `ROOT_DETECTED` alert.
2. **Disable the block** → Settings → Device integrity → toggle off → login
   succeeds on the same emulator, but the alert is still written.
3. **Splash revoke** → log in on a non-rooted device, then enable the block
   and restart the app on the rooted emulator with the saved session → the
   session is wiped and you land on Login with the notice.
4. **Integrity `log` mode** → default; login without Play Services (emulator)
   succeeds — nothing to verify, fail-open by design.
5. **Certificate pinning** → release build with wrong pins →
   `SSLPeerUnverifiedException` on every API call (check logcat); correct
   pins → everything works. Debug build ignores pins entirely.
6. **Tamper honesty** → patching the app to send `rooted:false` bypasses the
   client check but NOT Play Integrity `block` mode — that's the documented
   layering (self-report = signal, Integrity = verdict).

## 9. Known gaps / next stages

- ~~Analytics event reporting → **Stage 6**.~~ Done — see §7.
- ~~Root detection / Play Integrity / certificate pinning → **Stage 7**.~~
  Done — see above. Android code is statically reviewed only (no SDK in the
  build sandbox); run a real Gradle build + the test plan above in Android
  Studio before release.
- In-app "revoke other device": the backend only exposes admin-side revoke;
  the app lists devices and points users to the admin panel. (A tiny
  user-facing `POST /devices/:id/revoke` is the natural follow-up.)
- **100% prevention is impossible**: a second phone/camera can always record
  the screen. FLAG_SECURE + watermark + integrity + alerts are deterrence
  and attribution, not prevention.
