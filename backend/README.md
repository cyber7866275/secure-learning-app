# SecureLearn API — Stage 1: Backend Foundation

NestJS + TypeScript + Prisma + PostgreSQL + Redis.

**Stage 1 scope:** database schema (full domain model), authentication
(OTP + email/password + admin login), rotating refresh tokens with reuse
detection, device binding + max-device enforcement, admin user management,
device remote-logout, rate limiting, security headers.

> No content/upload endpoints yet — those are Stage 2. The `Pdf`, `Video`,
> `Category`, `Permission`, `ContentEvent`, `Banner` and `Notification`
> tables already exist in the schema so later stages only add migrations.

---

## 1. Setup

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Configure (use a REAL 32+ char secret in production)
cp .env.example .env
# edit .env: JWT_ACCESS_SECRET, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD

# 3. Install + generate Prisma client
npm install
npx prisma generate

# 4. Create tables
npx prisma migrate dev --name init

# 5. Seed the owner admin (reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from env)
npm run seed

# 6. Run
npm run start:dev
```

Health check: `GET http://localhost:3000/health` → `{"status":"ok"}`.

### Notes

- `prisma.config.ts` holds the datasource URL (Prisma 7 style); the schema
  file itself has no connection string.
- OTPs are **logged to the server console** by the dev provider
  (`[DEV OTP] phone=... otp=...`). Swap `OTP_PROVIDER` for an MSG91/Firebase
  implementation in `src/auth/auth.module.ts` for production.
- Access tokens live 15 min (`ACCESS_TOKEN_TTL_SEC`); refresh tokens rotate.
- Device overflow behavior: `DEVICE_OVERFLOW_BEHAVIOR=revoke-oldest` (default)
  or `deny`.

---

## 2. API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness |
| POST | `/auth/otp/request` | — | `{phone}` → 6-digit OTP (5-min TTL, 60s resend cooldown) |
| POST | `/auth/otp/verify` | — | `{phone, otp, deviceFingerprint, deviceName?, name?}` → tokens (creates user on first verify) |
| POST | `/auth/register` | — | `{name, email?, phone, password?, deviceFingerprint, deviceName?, maxDevices?}` → tokens |
| POST | `/auth/login` | — | `{email, password, deviceFingerprint, deviceName?}` → tokens |
| POST | `/auth/refresh` | — | `{refreshToken}` → **new pair** (old token consumed) |
| POST | `/auth/logout` | — | `{refreshToken}` → revoke (idempotent) |
| POST | `/auth/admin/login` | — | `{email, password}` → admin tokens |
| GET | `/devices` | user JWT | Own devices, newest first |
| GET | `/admin/users?search=&status=&page=&limit=` | admin JWT | Paginated users (no password hashes) |
| POST | `/admin/users` | admin JWT | Create user |
| GET | `/admin/users/:id` | admin JWT | User + devices |
| PATCH | `/admin/users/:id` | admin JWT | `{name?, email?, status?, maxDevices?, accessExpiresAt?}` — BLOCKED also revokes sessions |
| POST | `/admin/users/:id/revoke-all` | admin JWT | Revoke every session of a user |
| POST | `/admin/devices/:id/revoke` | admin JWT | Remote-logout one device |

Strict rate limits apply to `/auth/otp/*`, `/auth/login`, `/auth/admin/login`
(5–20 req/min) on top of the global 120 req/min.

---

## 3. Test plan (curl)

Run these against `http://localhost:3000`. Save values between steps.

```bash
BASE=http://localhost:3000

# --- 0. health -----------------------------------------------------------
curl -s $BASE/health
# expect: {"status":"ok",...}

# --- 1. register (email+password) ----------------------------------------
curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' -d '{
  "name":"Test User","email":"test@example.com","phone":"+919876543210",
  "password":"Secret123!","deviceFingerprint":"fp-device-1","deviceName":"Pixel 8 test"
}' | tee /tmp/reg.json
# expect 201: { accessToken, refreshToken, user:{...} }  (NO passwordHash field)
AT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/reg.json')).accessToken")
RT=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/reg.json')).refreshToken")

# --- 2. login -------------------------------------------------------------
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{
  "email":"test@example.com","password":"Secret123!",
  "deviceFingerprint":"fp-device-1","deviceName":"Pixel 8 test"
}' | head -c 120; echo
# expect 200 + fresh tokens

# --- 2b. wrong password → generic error + login_attempts row -------------
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{
  "email":"test@example.com","password":"wrong",
  "deviceFingerprint":"fp-device-1"
}'
# expect 401 {"message":"Invalid email or password"}

# --- 3. list own devices ---------------------------------------------------
curl -s $BASE/devices -H "Authorization: Bearer $AT"
# expect: [{ fingerprint:"fp-device-1", revoked:false, ... }]

# --- 4. device limit (default maxDevices=1, revoke-oldest) -----------------
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{
  "email":"test@example.com","password":"Secret123!",
  "deviceFingerprint":"fp-device-2","deviceName":"Second phone"
}' | tee /tmp/reg2.json
AT2=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/reg2.json')).accessToken")
RT2=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/reg2.json')).refreshToken")
curl -s $BASE/devices -H "Authorization: Bearer $AT2"
# expect: fp-device-1 now revoked:true, fp-device-2 active

# --- 5. refresh rotation ----------------------------------------------------
curl -s -X POST $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT2\"}" | tee /tmp/ref.json
RT3=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/ref.json')).refreshToken")
# expect 200 + NEW refreshToken (different from RT2)

# --- 5b. reuse of the consumed token → theft detection ----------------------
curl -s -X POST $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT2\"}"
# expect 401 "Session compromised..." AND all sessions revoked:
curl -s -X POST $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT3\"}"
# expect 401 as well (nuked by reuse detection)

# --- 6. OTP flow (dev provider prints OTP in server logs) -------------------
curl -s -X POST $BASE/auth/otp/request -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543211}'
# expect 200 {"message":"OTP sent","expiresInSec":300}
# resend immediately → 429 cooldown:
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"+919876543211}'
# expect 429
# copy OTP from server log, then:
curl -s -X POST $BASE/auth/otp/verify -H 'Content-Type: application/json' -d '{
  "phone":"+919876543211","otp":"<OTP-FROM-LOG>",
  "deviceFingerprint":"fp-device-3","deviceName":"OTP phone","name":"OTP User"
}' | head -c 120; echo
# expect 200 + tokens (new user auto-created)

# --- 7. admin login + user management ---------------------------------------
AAT=$(curl -s -X POST $BASE/auth/admin/login -H 'Content-Type: application/json' \
  -d '{"email":"<SEED_ADMIN_EMAIL>","password":"<SEED_ADMIN_PASSWORD>"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).accessToken")

curl -s "$BASE/admin/users?limit=5" -H "Authorization: Bearer $AAT" | head -c 200; echo
# expect 200 { data:[...], total, page, limit }

UID=$(curl -s "$BASE/admin/users?search=test@example.com" -H "Authorization: Bearer $AAT" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).data[0].id")

# block the user (also revokes their sessions):
curl -s -X PATCH $BASE/admin/users/$UID -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AAT" -d '{"status":"BLOCKED"}' | head -c 120; echo
# expect 200 with status BLOCKED

# blocked user cannot use their access token anymore:
curl -s -o /dev/null -w "%{http_code}\n" $BASE/devices -H "Authorization: Bearer $AT2"
# expect 403 (ActiveUserGuard re-checks the DB on every request)

# unblock for the next test:
curl -s -X PATCH $BASE/admin/users/$UID -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AAT" -d '{"status":"ACTIVE"}' -o /dev/null

# --- 8. remote device logout --------------------------------------------------
DID=$(curl -s $BASE/devices -H "Authorization: Bearer $AT2" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).find(d=>!d.revoked).id")
curl -s -X POST $BASE/admin/devices/$DID/revoke -H "Authorization: Bearer $AAT"
# expect 200, device revoked:true
curl -s -X POST $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT3\"}"
# expect 401/403 (token dead — invalid, or already nuked in step 5b)

# --- 9. logout (idempotent) ----------------------------------------------------
curl -s -X POST $BASE/auth/logout -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT3\"}"
# expect 200 {"message":"Logged out"} (even for an already-dead token)
```

### What "done" looks like

- [ ] register → 201, tokens issued, `passwordHash` never in responses
- [ ] wrong password → 401 generic message
- [ ] second device login revokes the first (default `revoke-oldest`)
- [ ] refresh returns a **new** refresh token; old one is dead
- [ ] reusing a consumed refresh token → 401 + **all** sessions revoked + `security_alerts` row (`REFRESH_REUSE`)
- [ ] OTP resend within 60s → 429; wrong OTP 5× → locked until re-request
- [ ] blocked user → 403 on `/devices` immediately (not after token expiry)
- [ ] admin device revoke → that device's refresh tokens die
- [ ] `login_attempts` rows exist for success + failure

---

## 4. Security notes

- Refresh tokens are opaque 96-hex-char values; only **SHA-256 hashes** are stored.
- OTPs are hashed (SHA-256) in Redis with 5-min TTL, max 5 attempts, 60s resend cooldown.
- Passwords: Argon2id. Login errors are generic to prevent account enumeration.
- `ActiveUserGuard` re-validates account status/expiry in the DB on each user request.
- Helmet headers + CORS + global `ValidationPipe` (whitelist, forbid non-whitelisted).
- No secrets in code: everything via env, validated at boot (`src/config/configuration.ts`).
- `security_alerts` captures refresh-token reuse; `login_attempts` captures brute-force signals (dashboards in Stage 6).

---

# Stage 2: Content APIs + Storage

**Scope:** S3-compatible private storage (presigned URLs), taxonomy
(category → subject → chapter), PDF/Video admin lifecycle (create → upload →
publish/unpublish/hide/delete/replace), default-deny permissions, the secure
access gate (short-lived signed URLs), user library + tree, banners.

> Videos: upload + organization work end-to-end in Stage 2, but playback URLs
> require `processingStatus=READY`, which only the **Stage 5 transcode worker**
> sets. Until then, exercise the full access/permission flow with PDFs.

## 1. Setup (adds MinIO)

```bash
docker compose up -d                      # postgres + redis + minio
# create the "securelearn" bucket once:
#   - via console http://localhost:9001 (minioadmin / minioadmin), or
#   - mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/securelearn
cp .env.example .env   # set STORAGE_* (dev defaults already point at MinIO)
npx prisma migrate dev --name stage2      # adds processingStatus, pendingStorageKey
npm run start:dev
```

Production: point `STORAGE_*` at Cloudflare R2 or AWS S3
(`STORAGE_FORCE_PATH_STYLE="false"`), keep the bucket **private**.

## 2. API reference (new routes)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/admin/taxonomy/categories` | admin | list / create |
| PATCH/DELETE | `/admin/taxonomy/categories/:id` | admin | edit / delete |
| GET/POST | `/admin/taxonomy/subjects?categoryId=` | admin | list / create |
| PATCH/DELETE | `/admin/taxonomy/subjects/:id` | admin | edit / delete |
| GET/POST | `/admin/taxonomy/chapters?subjectId=` | admin | list / create |
| PATCH/DELETE | `/admin/taxonomy/chapters/:id` | admin | edit / delete |
| POST | `/admin/pdfs` | admin | `{title, categoryId?, subjectId?, chapterId?}` → row (DRAFT) + presigned **PUT** URL |
| GET | `/admin/pdfs?...` | admin | paginated, search + taxonomy + status filters |
| GET/PATCH/DELETE | `/admin/pdfs/:id` | admin | read / edit metadata / delete (also deletes the object) |
| POST | `/admin/pdfs/:id/publish` | admin | DRAFT → PUBLISHED (**fails if file not uploaded**) |
| POST | `/admin/pdfs/:id/unpublish` | admin | → DRAFT |
| POST | `/admin/pdfs/:id/hide` | admin | → HIDDEN |
| POST | `/admin/pdfs/:id/replace` | admin | stages new key, returns new PUT URL (old file stays live) |
| POST | `/admin/pdfs/:id/replace/confirm` | admin | swaps keys after upload verified, deletes old object |
| *(same 9 routes)* | `/admin/videos/...` | admin | key pattern `videos/{uuid}/source.mp4` |
| POST | `/pdfs/:id/access` | user | permission check → presigned GET URL, **5 min** TTL |
| POST | `/videos/:id/access` | user | permission check → **authorized HLS master-manifest URL** (10 min) |
| GET | `/videos/:id/manifest` | user | JWT (master) or HMAC token (variant) → rewritten HLS playlist with presigned segment/key URLs |
| POST | `/admin/videos/:id/reprocess` | admin | reset FAILED (or any) video to PENDING for the packaging worker |
| GET | `/library/pdfs?...` | user | only published PDFs the user may access |
| GET | `/library/videos?...` | user | only published + READY videos the user may access |
| GET | `/library/tree` | user | category → subject → chapter tree with accessible counts |
| GET/POST | `/admin/permissions` | admin | list / grant `{userId, contentType: pdf\|video\|category, contentId, expiresAt?}` |
| DELETE | `/admin/permissions/:id` | admin | revoke |
| GET/POST/PATCH/DELETE | `/admin/banners...` | admin | home-screen banners CRUD |
| GET | `/banners` | — | public: active banners, ordered |

## 3. Test plan (curl)

Assumes Stage 1 flow done: `$ADMIN` = admin access token, `$USER_AT` / `$USER_ID` =
a normal user's token + id, `$BASE=http://localhost:3000`.

```bash
# --- 1. taxonomy -------------------------------------------------------------
CAT=$(curl -s -X POST $BASE/admin/taxonomy/categories -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"name":"Physics","type":"BOTH"}' | jq -r .id)
SUB=$(curl -s -X POST $BASE/admin/taxonomy/subjects -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d "{\"categoryId\":\"$CAT\",\"name\":\"Mechanics\"}" | jq -r .id)
CHAP=$(curl -s -X POST $BASE/admin/taxonomy/chapters -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d "{\"subjectId\":\"$SUB\",\"name\":\"Kinematics\"}" | jq -r .id)
# expect: three ids printed
# mismatched chain must fail (chapter from another subject):
curl -s -X POST $BASE/admin/pdfs -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d "{\"title\":\"Bad\",\"categoryId\":\"$CAT\",\"chapterId\":\"nope\"}"
# expect 400

# --- 2. create PDF -> upload via presigned PUT --------------------------------
RESP=$(curl -s -X POST $BASE/admin/pdfs -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Motion Notes\",\"categoryId\":\"$CAT\",\"subjectId\":\"$SUB\",\"chapterId\":\"$CHAP\"}")
PDF=$(echo "$RESP" | jq -r .pdf.id)
PUT=$(echo "$RESP" | jq -r .uploadUrl)
# expect: pdf.status == DRAFT
curl -s -X PUT "$PUT" -H 'Content-Type: application/pdf' --data-binary @/tmp/sample.pdf -o /dev/null -w '%{http_code}\n'
# expect 200 (upload goes straight to MinIO; the API never sees the bytes)

# --- 3. publish guards --------------------------------------------------------
curl -s -X POST $BASE/admin/pdfs/$PDF/publish -H "Authorization: Bearer $ADMIN"
# expect 200, status PUBLISHED
# a PDF created but never uploaded must refuse to publish:
PDF2=$(curl -s -X POST $BASE/admin/pdfs -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"title":"Empty"}' | jq -r .pdf.id)
curl -s -X POST $BASE/admin/pdfs/$PDF2/publish -H "Authorization: Bearer $ADMIN"
# expect 400 "has not been uploaded yet"

# --- 4. access without permission -> 403 + denied event ------------------------
curl -s -X POST $BASE/pdfs/$PDF/access -H "Authorization: Bearer $USER_AT" -w '\n%{http_code}\n'
# expect 403 "You do not have access to this content"
# library must be empty for this user:
curl -s $BASE/library/pdfs -H "Authorization: Bearer $USER_AT" | jq .total
# expect 0

# --- 5. grant permission (item-level) -> access works --------------------------
curl -s -X POST $BASE/admin/permissions -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"contentType\":\"pdf\",\"contentId\":\"$PDF\"}" | jq .granted
# expect true
URL=$(curl -s -X POST $BASE/pdfs/$PDF/access -H "Authorization: Bearer $USER_AT" | jq -r .url)
echo "$URL" | grep -c "X-Amz-Expires=300"
# expect 1 (5-minute presigned URL)
curl -s -o /dev/null -w '%{http_code}\n' "$URL"
# expect 200 (the URL actually downloads the file from MinIO)

# --- 6. revoke -> access denied again -------------------------------------------
PERM=$(curl -s "$BASE/admin/permissions?userId=$USER_ID" -H "Authorization: Bearer $ADMIN" | jq -r .data[0].id)
curl -s -X DELETE $BASE/admin/permissions/$PERM -H "Authorization: Bearer $ADMIN"
curl -s -X POST $BASE/pdfs/$PDF/access -H "Authorization: Bearer $USER_AT" -o /dev/null -w '%{http_code}\n'
# expect 403

# --- 7. category-level grant -> library + tree ---------------------------------
curl -s -X POST $BASE/admin/permissions -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"contentType\":\"category\",\"contentId\":\"$CAT\"}" | jq .granted
curl -s "$BASE/library/pdfs" -H "Authorization: Bearer $USER_AT" | jq .total
# expect >= 1
curl -s "$BASE/library/tree" -H "Authorization: Bearer $USER_AT" | jq '.[0] | {name, itemCount}'
# expect Physics with itemCount >= 1

# --- 8. replace flow --------------------------------------------------------------
RPL=$(curl -s -X POST $BASE/admin/pdfs/$PDF/replace -H "Authorization: Bearer $ADMIN")
RPUT=$(echo "$RPL" | jq -r .uploadUrl)
# old file still live:
curl -s -X POST $BASE/pdfs/$PDF/access -H "Authorization: Bearer $USER_AT" | jq -r .url \
  | xargs -I{} curl -s -o /dev/null -w '%{http_code}\n' {}
# expect 200
# confirm before uploading must fail:
curl -s -X POST $BASE/admin/pdfs/$PDF/replace/confirm -H "Authorization: Bearer $ADMIN"
# expect 400 "not uploaded yet"
curl -s -X PUT "$RPUT" -H 'Content-Type: application/pdf' --data-binary @/tmp/sample2.pdf -o /dev/null
curl -s -X POST $BASE/admin/pdfs/$PDF/replace/confirm -H "Authorization: Bearer $ADMIN" | jq .storageKey
# expect the NEW key; old object deleted from the bucket

# --- 9. banners -------------------------------------------------------------------
BID=$(curl -s -X POST $BASE/admin/banners -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"title":"Welcome","body":"New batch starts Monday"}' | jq -r .id)
curl -s $BASE/banners | jq length
# expect >= 1 (public, no auth needed)
```

### What "done" looks like

- [ ] taxonomy chain validated (mismatched subject/chapter → 400)
- [ ] create PDF → DRAFT + presigned PUT; real file uploads straight to MinIO
- [ ] publish without upload → 400; publish after upload → 200
- [ ] access without permission → **403**, `content_events` row with `access_denied`
- [ ] grant item permission → access → **200** with 5-min presigned URL that downloads
- [ ] revoke permission → 403 again
- [ ] category grant → library lists the PDF, tree shows counts
- [ ] 11+ rapid denials → `security_alerts` row (`DENIED_BURST`)
- [ ] replace: old file live until confirm; confirm swaps key + deletes old object
- [ ] video access while `processingStatus=PENDING` → 403 "still being processed"
- [ ] upload a video → worker picks it up (~30 s) → `PENDING → PROCESSING → READY`;
      `videos/{uuid}/hls/` holds master.m3u8, 3 variants, segments, enc.key, thumb.jpg
- [ ] `POST /videos/:id/access` (user) → `{ url: ".../videos/:id/manifest" }`
- [ ] `GET /videos/:id/manifest` with JWT → master with `?variant=&token=` URIs
- [ ] fetch a variant URI (no JWT) → playlist with presigned segment + EXT-X-KEY URLs
- [ ] tampered token / wrong video id → 403; expired token (>10 min) → 403
- [ ] break ffmpeg (e.g. non-video upload) → `processingStatus=FAILED` + `processingError`;
      `POST /admin/videos/:id/reprocess` → back to PENDING

## 4. Security notes (Stage 2)

- Bucket is private; the only URLs that ever exist are presigned (PUT 15 min,
  PDF GET 5 min, HLS segments/key 10 min). Storage keys are never sent to clients.
  Videos have NO direct file URL — they stream only through the authorized
  `/videos/:id/manifest` endpoint (JWT for master, 10-min HMAC token for variants).
- Video segments are AES-128 encrypted with a per-video random key
  (`videos/{uuid}/hls/enc.key`, served only via presigned URLs). This is
  AES-128, not Widevine DRM — the licensed Widevine upgrade path is documented
  in `src/video-processing/video-processing.module.ts`, not faked.
- Permission resolution is **default-deny**: no row = no access. Explicit item
  grant/deny wins over category grant/deny.
- Every access outcome is logged to `content_events` (`access_granted` /
  `access_denied` with reason); denial bursts (>10 / 5 min / user) raise a
  `DENIED_BURST` security alert.
- The access gate also re-validates the device (`deviceId` from the JWT must
  belong to the user and not be revoked) — on top of `ActiveUserGuard`'s
  account status/expiry re-check.
- Admin routes require an **admin** token (`AdminGuard`); user routes require
  user token + active account.
- `GET /banners` is intentionally public (banners carry no sensitive data).

## Stage 6 — Analytics + Security (API reference)

### Event ingestion (user token)

| Method | Route | Notes |
|---|---|---|
| POST | `/analytics/events` | Batch `{ events: [{ type, contentType, contentId, positionSec?, durationSec?, meta? }] }` → `{ received: n }`. Throttled 60/min/user. Whitelisted types only: `content_open`, `pdf_close`, `video_play`, `video_pause`, `video_heartbeat`, `video_complete`, `video_seek`. Anything else → 400. Written to `content_events` with userId/deviceId from the JWT. |

### Admin analytics (admin token, read-only)

| Method | Route | Notes |
|---|---|---|
| GET | `/admin/analytics/overview` | `{ totalUsers, activeUsers30d, totalPdfs, totalVideos, opensToday, playsToday, watchTimeTodaySec, deniedToday, unseenAlerts }` |
| GET | `/admin/analytics/timeseries?metric=&days=` | metric ∈ `opens\|plays\|watch_time\|logins\|signups`, days 1–90 (default 30). → `[{ date: "YYYY-MM-DD", value }]` UTC, zero-filled |
| GET | `/admin/analytics/content/:contentType/:id` | `{ id, title, opens, uniqueUsers, totalWatchTimeSec, lastOpenedAt }` |
| GET | `/admin/analytics/users/:userId` | `{ user, pdfsOpened, videosPlayed, totalWatchTimeSec, lastActiveAt, recentEvents[20] }` |

Metric definitions: **opens** = `access_granted` rows (server-authoritative — the backend
writes these itself, so clients can't spoof or drop them); **plays** = app-reported
`video_play`; **watch_time** = computed from `video_heartbeat` rows
(see algorithm below); **logins** = successful `login_attempts`; **signups** = users created.

### Admin security feeds (admin token, read-only)

| Method | Route | Notes |
|---|---|---|
| GET | `/admin/security/alerts?unseenOnly=&page=&limit=` | paginated, newest first, includes user |
| PATCH | `/admin/security/alerts/:id/seen` | mark seen |
| GET | `/admin/security/login-attempts?success=&page=&limit=` | paginated, newest first |
| GET | `/admin/security/denied-attempts?page=&limit=` | `content_events` with event=`access_denied`, includes user + `meta.reason`/`meta.ip` |

### Watch-time algorithm

Documented in `src/analytics/analytics.util.ts` (pure functions, unit-tested):
heartbeats are sorted and split into sessions — a gap **> 120s** starts a new
session and the gap itself is never counted. Per session: `(last − first) + 30s`
trailing credit. Sessions spanning UTC midnight are split across days in the
per-day chart (documented approximation). Timeseries bucketing is done in JS
over the requested window; if event volume grows large, move it to SQL
`date_trunc` aggregation or a materialized daily rollup.

### Suspicious-activity rules

- **MULTI_IP** (live): on successful login, distinct successful-login IPs for the
  user in the last 24h ≥ 3 → `security_alerts` row (deduplicated: max one per
  user per 24h). Best-effort — never breaks login. Future rules (impossible
  travel, device farming, login velocity) hook in at the same place;
  see `AuthService.checkMultiIp`.

### Stage 6 test plan (curl)

Assumes `$ADMIN` (admin token), `$USER_AT` (user token), `$USER_ID`, `$BASE`.

```bash
# --- 1. ingest a batch as the user -------------------------------------------
curl -s -X POST $BASE/analytics/events -H "Authorization: Bearer $USER_AT" \
  -H 'Content-Type: application/json' -d '{
    "events": [
      {"type":"video_play","contentType":"video","contentId":"vid123"},
      {"type":"video_heartbeat","contentType":"video","contentId":"vid123","positionSec":30},
      {"type":"video_heartbeat","contentType":"video","contentId":"vid123","positionSec":60},
      {"type":"video_complete","contentType":"video","contentId":"vid123","durationSec":90}
    ]}'
# expect: {"received":4}

# --- 2. bad type rejected ------------------------------------------------------
curl -s -X POST $BASE/analytics/events -H "Authorization: Bearer $USER_AT" \
  -H 'Content-Type: application/json' -d '{"events":[{"type":"hacked","contentType":"video","contentId":"x"}]}'
# expect 400

# --- 3. overview ---------------------------------------------------------------
curl -s $BASE/admin/analytics/overview -H "Authorization: Bearer $ADMIN" | jq .
# expect keys: totalUsers, activeUsers30d, totalPdfs, totalVideos, opensToday,
# playsToday, watchTimeTodaySec, deniedToday, unseenAlerts

# --- 4. timeseries ---------------------------------------------------------------
curl -s "$BASE/admin/analytics/timeseries?metric=watch_time&days=7" \
  -H "Authorization: Bearer $ADMIN" | jq .
# expect 7 rows, every row has date+value, missing days are 0

# --- 5. per-content + per-user -----------------------------------------------------
curl -s $BASE/admin/analytics/content/video/vid123 -H "Authorization: Bearer $ADMIN" | jq .
curl -s $BASE/admin/analytics/users/$USER_ID -H "Authorization: Bearer $ADMIN" | jq .
# expect opens/uniqueUsers/watchTime; user stats with recentEvents (<=20)

# --- 6. security feeds -------------------------------------------------------------
curl -s "$BASE/admin/security/alerts?unseenOnly=true" -H "Authorization: Bearer $ADMIN" | jq .total
ALERT=$(curl -s "$BASE/admin/security/alerts?limit=1" -H "Authorization: Bearer $ADMIN" | jq -r .data[0].id)
curl -s -X PATCH $BASE/admin/security/alerts/$ALERT/seen -H "Authorization: Bearer $ADMIN" | jq .seen
# expect: true
curl -s "$BASE/admin/security/login-attempts?success=false&limit=5" -H "Authorization: Bearer $ADMIN" | jq .
curl -s "$BASE/admin/security/denied-attempts?limit=5" -H "Authorization: Bearer $ADMIN" | jq .
# denied rows carry meta.reason (no_permission | device_invalid | ...) and meta.ip

# --- 7. MULTI_IP rule ----------------------------------------------------------------
# Log in successfully as the same user from 3 different IPs (use X-Forwarded-For
# if behind a proxy, or three different networks), then:
curl -s "$BASE/admin/security/alerts" -H "Authorization: Bearer $ADMIN" \
  | jq '.data[] | select(.type=="MULTI_IP")'
# expect: one MULTI_IP alert with distinctIpCount >= 3 (deduped per 24h)
```

---

## Stage 7 — Hardening

### Rate limiting (audited)

Per-IP per-minute limits. Global buckets: `default` 120/min, named `auth` 30/min
(`src/app.module.ts`); routes opt into stricter per-route limits:

| Route | Limit | Notes |
|---|---|---|
| `POST /auth/otp/request` | 3/min | + 60s Redis resend-cooldown in the service |
| `POST /auth/otp/verify` | 10/min | + max 5 attempts per code, then it burns |
| `POST /auth/register` | 5/min | account-farming target |
| `POST /auth/login` | 10/min | Argon2id verify cost already slows brute force |
| `POST /auth/refresh` | 10/min | rotation + reuse detection on top |
| `POST /auth/admin/login` | 5/min | privileged target |
| `POST /analytics/events` | 60/min | batch ingest |

### Request hardening

- **Helmet** on (secure headers). **CORS** allowlist via `CORS_ORIGIN`
  (comma-separated; never `*` in production).
- **Body limits**: JSON + urlencoded capped at **256kb** (`src/main.ts`).
  Uploads go straight to object storage via presigned URLs, so the API never
  needs large bodies.
- **ValidationPipe**: `whitelist: true, forbidNonWhitelisted: true` — unknown
  fields are rejected, not ignored.

### Play Integrity

Env: `PLAY_INTEGRITY_ENABLED` (default `false`), `ANDROID_PACKAGE_NAME`
(default `com.securelearn.app`), `GOOGLE_APPLICATION_CREDENTIALS` (service
account JSON path; read automatically by the googleapis client).

The app sends an optional `integrityToken` with login/OTP-verify/register.
Enforcement mode comes from the `integrity_enforcement` setting
(`off` | `log` | `block`, default `log`):

- `off` — token ignored entirely.
- `log` — token verified when present; failures write an `INTEGRITY_FAILED`
  security alert; login always proceeds.
- `block` — failed verdict → 403; missing token → 403 (a "block" deployment
  must not be bypassable by omitting the token).

Fail-open design: disabled by default, and if enabled but misconfigured
(no credentials) or the Google API errors, verification returns OK and logs
loudly — an outage or misconfig must never silently lock every user out.
Tokens only decode for **Play-distributed** builds (Play Console → App
integrity → linked Cloud project).

### Rooted devices

The app self-reports `rooted: true` (RootBeer) in the auth DTOs. The server:
1. Always writes a `ROOT_DETECTED` security alert (deduped per user per 24h).
2. Blocks the login with 403 when `root_block_enabled` is `true` (default).

The self-report is a *signal*, not proof — a tampered app can lie, which is
exactly why Play Integrity exists as the hardware-backed counterpart.
The app can also report `root_detected` via `POST /analytics/events`
(device-level event; `contentType`/`contentId` are null), which raises the
same alert.

### Stage 7 test plan (curl)

```bash
# --- 1. root block (default ON) ------------------------------------------------
# login with the honest rooted flag:
curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@x.com","password":"secret123","deviceFingerprint":"fp-1","rooted":true}' \
  | jq .message
# expect 403 "This device appears to be rooted..."
curl -s "$BASE/admin/security/alerts" -H "Authorization: Bearer $ADMIN" \
  | jq '.data[] | select(.type=="ROOT_DETECTED")'
# expect: one ROOT_DETECTED alert (deduped per 24h)

# --- 2. disable the block, login proceeds but still alerts -----------------------
curl -s -X PUT $BASE/admin/settings -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"settings":{"root_block_enabled":"false"}}' | jq .settings.root_block_enabled
# repeat the login above -> expect 200 with tokens

# --- 3. integrity log mode (PLAY_INTEGRITY_ENABLED=false) ------------------------
# login WITHOUT integrityToken -> expect 200 (nothing to verify, fail-open)
# Set PLAY_INTEGRITY_ENABLED=true without credentials, restart, login again ->
# expect 200 + a loud "no Google credentials" error in server logs (fail-open)
```

### Dependency audit

`npm audit` could not run in the build sandbox (the audit endpoint is blocked
by network policy) — **run it on your machine before launch** and patch what
is safely fixable. Record the outcome here when you do.
