# Deployment Guide — Production

This guide takes the app from this repo to a production deployment. It assumes
a custom domain (e.g. `api.yourdomain.com` for the API,
`admin.yourdomain.com` for the panel) and a Google Play Console account.

Before anything else, read [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) —
this guide references it at each step.

## 1. Backend API (VPS + Docker)

**Machine:** any VPS with ≥2 vCPU / 4 GB RAM (Hetzner, DigitalOcean, AWS EC2…).
Install Docker + the Compose plugin.

1. Copy the repo (or just `backend/`) to the server.
2. Create the production env file from `.env.example`:
   - `JWT_ACCESS_SECRET`, `HLS_TOKEN_SECRET`: `openssl rand -hex 32` each.
   - `CORS_ORIGIN=https://admin.yourdomain.com`
   - `API_PUBLIC_URL=https://api.yourdomain.com` (used for absolute HLS
     manifest URLs — must be the public URL, not localhost).
   - `STORAGE_*`: point at Cloudflare R2 (below), `STORAGE_FORCE_PATH_STYLE=false`.
   - `DATABASE_URL` / `REDIS_URL`: managed services (below) or the Compose ones.
   - `PLAY_INTEGRITY_ENABLED=true` (after §5), `ANDROID_PACKAGE_NAME=com.securelearn.app`,
     `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-play.json`.
   - `chmod 600 .env`.
3. `docker compose up -d` (postgres + redis from the Compose file are fine for
   v1; see §2 for the managed upgrade path).
4. Run migrations: `npx prisma migrate deploy` (never `migrate dev` in prod).
5. Seed the owner admin once: `npm run seed` with `SEED_ADMIN_EMAIL` /
   `SEED_ADMIN_PASSWORD` set, then change the password in the admin panel.
6. Start the API: `npm run start:prod` (or `node dist/main.js` behind
   systemd/pm2). The in-process video worker polls for PENDING videos
   automatically (`VIDEO_WORKER_ENABLED=true`).
7. Put Cloudflare in front: DNS `api.yourdomain.com` → server, proxy ON,
   SSL "Full (strict)", "Always Use HTTPS", WAF managed ruleset on.
   Restrict `/admin/*` API routes to your office/VPN IPs via a Cloudflare
   WAF custom rule or nginx `allow/deny`.

**ffmpeg:** the worker needs it on the API host: `apt install ffmpeg` and set
`FFMPEG_PATH`/`FFPROBE_PATH` (defaults assume they're on PATH).

## 2. Database & Redis

**v1 (simple):** the Compose `postgres:16-alpine` + `redis:7-alpine` services.
Back up with a nightly `pg_dump` cron copied off-machine, and enable Redis
persistence (`appendonly yes` via a custom redis.conf or command override).

**Upgrade path (recommended before real scale):** managed Postgres
(Neon / Supabase / RDS):
1. Create the database, copy its connection string.
2. `DATABASE_URL=<new> npx prisma migrate deploy`
3. Migrate data: `pg_dump` from the VPS → `pg_restore`/`psql` into the managed DB.
4. Update `.env`, restart. Keep the old DB for a week, then decommission.

## 3. Object storage — Cloudflare R2

MinIO is dev-only. For production:

1. Cloudflare dashboard → R2 → Create bucket (e.g. `securelearn-prod`).
2. **Keep it private**: no public dev URL, no custom public domain — the API
   serves everything through short-lived presigned URLs.
3. Create an API token scoped to that bucket (Object Read & Write).
4. `.env`: `STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
   `STORAGE_REGION=auto`, `STORAGE_BUCKET=securelearn-prod`,
   `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` from the token,
   `STORAGE_FORCE_PATH_STYLE=false`.
5. Existing content migration (if any): `rclone sync` MinIO → R2, then verify
   a sample of `videos/*/hls/master.m3u8` keys exist before switching DNS.

## 4. Admin panel — Vercel

1. Import `admin-panel/` as a Vercel project (Next.js preset).
2. Env vars: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
   (check the panel's `.env.example` for the exact names).
3. Deploy; map `admin.yourdomain.com`. Protect it further with Vercel
   Password Protection or Cloudflare Access during early rollout.

## 5. Play Integrity (server + Play Console)

1. **Google Cloud:** create a project (or reuse), enable the **Play Integrity
   API**, create a service account, download its JSON key.
2. **Play Console:** Release → Setup → App integrity → link the Cloud project.
3. **Server:** place the JSON at `/run/secrets/google-play.json` (mode 600),
   set `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-play.json` and
   `PLAY_INTEGRITY_ENABLED=true`, restart the API. Watch logs on boot for the
   "Play Integrity verification is ENABLED" warning — that's your confirmation.
4. **Admin panel:** Settings → Device integrity → enforcement `log` first.
   Ship the app, watch `/security` for `INTEGRITY_FAILED` alerts for a week.
   Only then switch to `block`. (`log` is the safe default; `block` rejects
   logins with missing/failed verdicts.)
5. Note: integrity tokens only verify for **Play-distributed builds**
   (internal/closed testing tracks work too). Sideloaded APKs will fail —
   that's the point.

## 6. Android release build

1. `local.properties` (or env):
   `api.baseUrl=https://api.yourdomain.com`
   `api.certPins=sha256/<current-key-pin>,sha256/<backup-key-pin>`
   (extract per SECURITY_CHECKLIST §3; pin the **public key**).
2. Configure release signing (`signingConfigs.release` with your keystore —
   the keystore lives on YOUR machine / CI secrets, never in git).
3. `./gradlew assembleRelease` (or `bundleRelease` for Play). Smoke-test the
   APK: login, OTP, PDF open (watermark moves, screenshot black), video play,
   offline queue → analytics appear in the admin dashboard.
4. **Play Console:** upload the AAB, enable **Play App Signing**, roll out to
   an internal test track first. Confirm `ANDROID_PACKAGE_NAME` on the server
   matches the Play listing exactly.

## 7. OTP in production

Replace the dev OTP provider (it logs codes to console — never ship it):
implement `OtpProvider` with MSG91 (or Firebase), wire it in
`auth.module.ts` where `DevOtpProvider` is currently bound. Keep the
60-second resend cooldown and 5-attempt burn.

## 8. Backups & monitoring

- Nightly DB dumps off-machine + quarterly restore drill.
- Ship backend logs to an aggregator; alert on 5xx spikes and on bursts of
  `ROOT_DETECTED` / `INTEGRITY_FAILED` / `DENIED_BURST` alerts.
- Uptime check on `https://api.yourdomain.com/health` (add a health endpoint
  or use `/settings`).

## 9. Rollback

- **API:** keep the previous Docker image tagged; `docker compose` rollback =
  retag + restart + `prisma migrate resolve` if a migration needs reverting
  (write down-migrations for risky schema changes).
- **App:** Play Console lets you halt a rollout; keep the previous AAB in a
  closed track. Never rotate cert pins and the server key in the same release.
- **Secrets rotation** (suspected leak): rotate `JWT_ACCESS_SECRET` +
  `HLS_TOKEN_SECRET` (forces all users to re-login), storage keys, then the
  Google service account key — in that order.
