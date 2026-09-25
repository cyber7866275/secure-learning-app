# Security Checklist — Pre-Launch

Run through this list before the first production release, and again after any
infrastructure change. Every item says **what** to check and **how**.
Nothing here is optional for launch; deferrals are marked explicitly.

## 1. Secrets & environment

- [ ] **No secrets in git.** Run from the repo root:
  `git log -p --all | grep -iE "password|secret|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY" | head`
  and the secret-scan below. Any hit = rotate the secret, purge history.
- [ ] **Production `.env` differs from every example.** `JWT_ACCESS_SECRET` and
  `HLS_TOKEN_SECRET` are each `openssl rand -hex 32` (≥32 chars; the backend
  refuses to boot otherwise). Never reuse dev values.
- [ ] **Seed admin rotated.** `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` used once
  for `npm run seed`, then changed via the admin panel (or the vars removed).
- [ ] **Google service-account JSON is a mounted secret**, not a repo file:
  `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-play.json`, file mode 600.
- [ ] **`.env` file permissions** on the server: `chmod 600`, owned by the app user.

## 2. Object storage (R2 / S3)

- [ ] **Bucket is private.** No public bucket policy, no public ACL. Verify in
  the Cloudflare/AWS console: "Block all public access" ON (S3) / no public
  bucket URL exposure (R2).
- [ ] **Access keys are scoped** to the one bucket (R2 API token with
  Object Read & Write on that bucket only), not account-wide.
- [ ] **CORS on the bucket is off or restricted** — the API serves content via
  presigned URLs; the bucket never needs browser CORS.
- [ ] **Lifecycle:** old `videos/*/hls` prefixes from deleted content are
  removed (the API deletes on content delete; verify no orphan prefixes after
  a test delete).

## 3. Network & TLS

- [ ] **HTTPS everywhere.** The API is behind Cloudflare (or equivalent) with
  "Always Use HTTPS" and HSTS. The Android `BASE_URL` is `https://…` — no
  cleartext in production.
- [ ] **CORS origins are explicit.** `CORS_ORIGIN=https://admin.yourdomain.com`
  — never `*` in production (the backend reflects `*` as credentials-safe, but
  an explicit list is auditable).
- [ ] **Certificate pins shipped in the release APK.** Two pins minimum
  (current + backup key). Extract with:
  `openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com </dev/null 2>/dev/null | openssl x509 -outform DER | openssl dgst -sha256 -binary | openssl enc -base64`
  Pin the **public key**, not the cert, so renewals with the same key don't break the app.
- [ ] **Pin-rotation plan exists.** When rotating the server key: ship an app
  update with the new backup pin first, wait for adoption, then rotate.
- [ ] **`/admin/*` routes are IP-restricted** at the reverse proxy/VPN
  (the admin panel is a separate Vercel deployment, but the API's admin routes
  should still only accept the office/VPN ranges).

## 4. Auth & accounts

- [ ] **OTP provider is production.** The dev provider logs OTPs to console —
  confirm `OTP_PROVIDER` is MSG91/Firebase with prod keys, and the dev provider
  is not wired in the prod build.
- [ ] **Rate limits reviewed** (see backend README §Rate limiting): OTP 3/min,
  login 10/min, register 5/min, admin login 5/min. Adjust only after reading
  the failed-login analytics for false positives.
- [ ] **`root_block_enabled=true`** and **`integrity_enforcement`** set per
  policy in the admin panel (Settings → Device integrity). `block` mode only
  after the Play Console linking steps in DEPLOYMENT.md are done.
- [ ] **JWT lifetimes** (`ACCESS_TOKEN_TTL_SEC=900`) are acceptable; refresh
  rotation + reuse detection confirmed working (test: reuse an old refresh
  token → all sessions revoked + REFRESH_REUSE alert).

## 5. Android app

- [ ] **Release build is R8-obfuscated** (`isMinifyEnabled=true`,
  `isShrinkResources=true` in the `release` block). Install the release APK
  and smoke-test: login, PDF open, video play, watermark visible.
- [ ] **FLAG_SECURE verified on a real device**: screenshot and screen
  recording show black on the PDF viewer and video player.
- [ ] **Play App Signing enabled** and the **Play Integrity API linked**
  (Play Console → Setup → App integrity). `ANDROID_PACKAGE_NAME` matches the
  Play listing exactly.
- [ ] **No debuggable release**: `android:debuggable=false` (Gradle sets this
  for release automatically — verify with
  `aapt dump badging app-release.apk | grep debuggable`, or check the merged
  manifest).
- [ ] **Backup rules**: `android:allowBackup=false` (or a scoped backup rules
  file) so app-private files can't be pulled via adb backup.

## 6. Data & retention

- [ ] **Database backups**: daily automated snapshots (Neon point-in-time
  recovery, or `pg_dump` cron on the VPS) + one tested restore.
- [ ] **Redis persistence**: AOF or RDB enabled so OTP/refresh-token state
  survives a restart (refresh tokens live in Redis).
- [ ] **Retention policy decided** for `content_events`/`login_attempts`
  (they grow fast). At minimum, document the policy; ideally a monthly
  archive/delete job.
- [ ] **ffmpeg sandbox**: the video worker runs as an unprivileged user;
  uploads are validated as real media before transcoding (the packager rejects
  non-video → FAILED state, never executes it).

## 7. Monitoring & response

- [ ] **Security alerts are watched.** `security_alerts` (unseen) is checked
  daily — assign an owner. The admin `/security` page is the console.
- [ ] **Log shipping**: backend stdout → a log aggregator; alert on 5xx spikes
  and on `INTEGRITY_FAILED`/`ROOT_DETECTED` bursts.
- [ ] **Incident runbook exists**: block user (admin panel), revoke devices/
  sessions, rotate `HLS_TOKEN_SECRET` + `JWT_ACCESS_SECRET` (forces re-login),
  rotate storage keys.
- [ ] **`npm audit` run on the deploy machine** and fixable issues patched
  (the sandbox where this app was built blocks the audit endpoint, so this
  MUST happen on your machine before launch).

## 8. Legal & honesty

- [ ] **Privacy note for users**: the app collects watch-time analytics and
  device security signals — disclose it in the app listing / onboarding.
- [ ] **The "second camera" limitation is understood**: no software prevents
  filming the screen with another phone. Watermark + integrity + alerts are
  deterrence and attribution, not prevention.
