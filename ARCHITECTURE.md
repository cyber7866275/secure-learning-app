# Secure Learning App — Complete Project Architecture

*Ziggy dwara taiyaar — Huzaifa ke liye | 25 Sep 2026*

> Aapne sahi samjha: ye sirf "PDF app" nahi hai — ye ek **secure content platform** hai jisme aap owner/admin hain aur users sirf authorized content dekh sakte hain.

---

## 0. Big Picture (System Overview)

```
┌──────────────┐      HTTPS (JWT)       ┌──────────────────┐
│  Android App │ ◄───────────────────►  │   API Server     │
│ Kotlin+Compose│                        │  NestJS (Node)   │
└──────┬───────┘                        └────────┬─────────┘
       │ signed URLs (5–15 min expiry)           │ SQL
       ▼                                         ▼
┌──────────────┐                        ┌──────────────────┐
│Private Storage│                        │   PostgreSQL     │
│ R2/S3 + CDN  │                        │   + Redis cache  │
└──────────────┘                        └──────────────────┘
        ▲
        │ presigned PUT (upload)
┌──────────────┐      HTTPS             ┌──────────────────┐
│ Admin Panel  │ ◄───────────────────►  │   Admin APIs     │
│ Next.js web  │   (role: admin only)   │  (same server)   │
└──────────────┘                        └──────────────────┘
```

**Core principle:** Content kabhi public nahi hota. Har PDF/video request par server pehle **permission check** karta hai, tabhi **short-lived signed URL** deta hai. App sirf authorized, expiring links dekhti hai — asli file ka permanent address kisi user ke paas kabhi nahi hota.

---

## 1. Android App Architecture

**Stack:** Kotlin + Jetpack Compose, minSdk 26 (Android 8+)

**Layers (Clean Architecture + MVVM):**

| Layer | Kaam |
|---|---|
| `ui/` | Compose screens: Splash, Login (OTP/Email), Home, Categories, PdfLibrary, VideoLibrary, PdfViewer, VideoPlayer, Profile, Notifications, Help/Support |
| `viewmodel/` | Har screen ka ViewModel, StateFlow se UI state |
| `domain/` | Use cases: `GetPdfs`, `RequestContentAccess`, `ReportAnalytics`… |
| `data/` | Repositories; `remote/` Retrofit API, `local/` EncryptedSharedPreferences/DataStore |
| DI | Hilt |

**Security components (app ke andar):**
- **SecurePdfRenderer** — Android `PdfRenderer` API se PDF ko memory me page-by-page **Bitmap** me render karo. Koi text layer render nahi hoti → **copy/select technically impossible**. File encrypted temp me, viewer band hote hi wipe (overwrite + delete). Kabhi external PDF reader ko intent mat bhejo.
- **SecureVideoPlayer** — Media3 ExoPlayer; HLS/DASH + Widevine DRM; manifest aur segments signed URLs se. Offline download API disabled, cache encrypted.
- **FLAG_SECURE** — viewer/player screens par; OS-level screenshot aur screen recording block.
- **WatermarkOverlay** — Compose overlay: `USER NAME + USER ID + DATE/TIME`, har 20–30 second me random position par move, halka transparent.
- **Device binding** — pehle login par device fingerprint register; max devices server enforce karega.
- **Root detection + Play Integrity API** — rooted/tampered device par login block ya warning (admin setting).
- **Certificate pinning** (OkHttp) — MITM attacks rokne ke liye.
- **R8/ProGuard** obfuscation.

**Bottom navigation:** Home | Library | Videos | Profile (aapke spec ke hisaab se).

---

## 2. Backend Architecture

**Stack:** Node.js + **NestJS** (TypeScript). *Alternative: FastAPI (Python) — agar aapki team Python me comfortable ho.*

**Modules:**
- `auth` — OTP (MSG91 / Firebase Phone Auth), email+password (Argon2 hashing), JWT access (15 min) + rotating refresh tokens, device binding
- `users` — CRUD, block/unblock, access expiry date
- `devices` — register, list, revoke, max-device enforcement
- `content` — PDF/video metadata, category/subject/chapter organization, publish/unpublish/hide/delete/replace, presigned PUT se upload
- `access` — **har content request par server-side permission check**, phir short-lived signed URL issue
- `permissions` — per-user grants
- `analytics` — event ingestion + aggregation
- `notifications` — FCM push (banner/notice)
- `admin` — dashboard stats, security alerts (guard: `role=admin`)

**Cross-cutting:** HTTPS only, Helmet headers, rate limiting (login/OTP par strict), request validation, har admin action ka audit log, refresh-token blacklist Redis me.

---

## 3. Database Design (PostgreSQL)

| Table | Key columns |
|---|---|
| `users` | id, name, email, phone (unique), password_hash, status (active/blocked), max_devices, access_expires_at |
| `admins` | id, email, password_hash, role (owner/support), last_login |
| `devices` | id, user_id, device_fingerprint, device_name, ip, last_seen_at, revoked |
| `refresh_tokens` | id, user_id, device_id, token_hash, expires_at, revoked |
| `categories` | id, name, type (pdf/video/both), sort_order |
| `subjects` | id, category_id, name |
| `chapters` | id, subject_id, name |
| `pdfs` | id, title, category_id, subject_id, chapter_id, storage_key, page_count, status (draft/published/hidden) |
| `videos` | id, title, category_id, subject_id, chapter_id, storage_key (manifest), drm_key_id, duration_sec, thumbnail_key, status |
| `permissions` | id, user_id, content_type (pdf/video/category), content_id, granted, expires_at — **default deny**: row nahi = access nahi |
| `content_events` | id, user_id, device_id, content_type, content_id, event (open/play/pause/heartbeat/complete/denied), meta JSON, created_at |
| `login_attempts` | id, identifier, success, ip, device, created_at |
| `security_alerts` | id, type (root_detected, multi_ip, denied_burst…), user_id, detail, seen |
| `banners` | id, title, body, image_key, active, sort_order |
| `notifications` | id, user_id (null = broadcast), title, body, read |

Indexes: `(user_id, created_at)` on events; unique `(phone)`, `(user_id, device_fingerprint)`.

---

## 4. Admin Panel (Web)

**Stack:** Next.js + Tailwind, alag deployment (Vercel/Netlify), sirf admin login.

**Pages:**
- **Dashboard** — cards (Total Users, Active Users, Total PDFs, Total Videos, Today's Activity, Security Alerts), charts (daily active, content opens, watch time), tables (Recent Users, Recent Content Activity)
- **Content** — PDF/Video list, upload (presigned PUT direct to storage), edit metadata, publish/unpublish/hide/delete/replace
- **Users** — search, create, block/unblock, access expiry, per-user permission editor, device list + **remote logout**
- **Analytics** — per-user drilldown: kisne kaunsi PDF kholi, kaunsa video dekha, watch time, last active
- **Security** — alerts feed, failed logins, denied-access attempts log
- **Settings** — toggles: screenshot protection ON/OFF, recording protection ON/OFF, watermark ON/OFF, default max devices, content expiry defaults; banner/notice manager

---

## 5. PDF Security (detail me)

1. **Upload:** Admin → presigned PUT → **private bucket**. Bucket 100% private, koi public policy nahi.
2. **Read flow:** App `POST /api/pdfs/{id}/access` (JWT ke saath) → server check karta hai: permission hai? expiry valid? device allowed? → sab haan to **5-minute presigned GET URL**.
3. App file ko encrypted temp storage me rakhti hai (ya range-request se stream karti hai), `PdfRenderer` se **Bitmap** render → Compose me dikhao.
4. **Copy impossible:** text layer render hi nahi hoti — screen par sirf image hai. Text selection/long-press disabled.
5. **Download/share/print:** koi download button nahi, koi share intent nahi, print framework call nahi.
6. **Screenshot/recording:** viewer Activity par `FLAG_SECURE`.
7. **Direct URL access:** presigned URL 5 minute me expire; har request par naya token; bucket private hone se direct guessing bekaar.
8. Viewer close → temp file **overwrite + delete**; recent-apps thumbnail bhi FLAG_SECURE se blank rehta hai.

## 6. Video Security (detail me)

1. Upload ke baad **worker (ffmpeg)** HLS banata hai: multi-bitrate segments + **AES-128 encryption** (shuru me), baad me **Widevine DRM**.
2. **Playback flow:** `POST /api/videos/{id}/access` → permission check → signed manifest URL (10 min) + per-segment signing (signed cookies ya short-lived segment URLs).
3. **ExoPlayer (Media3)** + DRM session; offline download API disabled; cache encrypted.
4. Player screen par `FLAG_SECURE`.
5. Manifest URL copy karke browser me kholne par bhi nahi chalega: expiry + device-bound token.

**DRM note:** Widevine ke liye license server chahiye (Axinom/BuyDRM/EZDRM ≈ $100–500/mo, ya Cloudflare Stream/Mux jisme DRM included hai). Shuru me **AES-128 HLS + signed URLs** kaafi hain; Widevine Stage 5 me add karenge.

## 7. Authentication & Sessions

- **OTP login:** phone → 6-digit OTP (5 min expiry, max 5 attempts, resend cooldown). Provider: **MSG91** (India me sasta) ya Firebase Phone Auth.
- **Email/password:** Argon2id hashing, login par strict rate-limit.
- **Tokens:** Access JWT **15 min**, Refresh token **rotating** (reuse detect hua → saare sessions revoke = theft detection).
- **Device limit:** login par device count check; limit cross ho to sabse purana session revoke ya login deny (admin setting). Admin **kisi bhi device ko remotely logout** kar sakta hai (refresh blacklist + push notification).
- Har login/logout/failed attempt log hota hai.

## 8. Permissions Model

- **Default deny.** User ko kuch nahi dikhta jab tak grant na ho.
- Grant levels: poori **category**, **subject**, ya single **PDF/video** — `permissions` table me, optional `expires_at` ke saath.
- App ki home/library APIs **sirf granted content** return karti hain (server-side filter).
- Direct `/access` API par **dobara check** — client par bharosa nahi.
- Admin ek click me user ka saara access revoke kar sakta hai; content expiry date aur user access expiry date dono supported.

## 9. Analytics

App ye events bhejti hai (batch me, WorkManager se taaki battery/network bache):
- `content_open`, `video_play`, `video_pause`, `video_heartbeat` (har 30s → watch time calculate), `video_complete`
- `login_success`, `login_failed`, `access_denied`
- `screenshot_attempt_blocked` (jahan detect ho sake), `root_detected`

Admin dekhta hai: totals, per-user history, watch time, last active, device/session info, failed logins, security alerts.

> **IMPORTANT (aapne bilkul sahi pakda):** Download completely disabled hai, to "kitne logon ne download kiya" ka actual count exist nahi karega. Uski jagah system **unauthorized access/download attempts** ko `access_denied` events me log karega — yehi aapka asli metric hai.

---

## 10. Hosting & Deployment

| Part | Recommendation |
|---|---|
| API server | Docker image → **VPS** (Hetzner/DigitalOcean) se start; scale par AWS ECS/Fly.io. CI/CD: GitHub Actions |
| Database | Managed Postgres — **Neon/Supabase** (free tier se start) → scale par RDS |
| Redis | Sessions/blacklist/cache — Upstash ya VPS par |
| Storage | **Cloudflare R2** (S3-compatible, **zero egress fee** — video ke liye best) ya AWS S3 + CloudFront signed URLs |
| Video processing | Worker me ffmpeg (VPS par) ya AWS MediaConvert; zero-ops option: Cloudflare Stream/Mux (mehenga lekin aasaan) |
| Admin panel | Vercel/Netlify |
| Secrets | Env vault (Doppler/Infisical) — kabhi repo me nahi |

## 11. Monthly Running Cost (INR, approximate)

| Item | Bootstrap | Growth |
|---|---|---|
| VPS (API + worker) | ₹1,500–3,000 | ₹4,000–10,000 |
| Managed Postgres | ₹0–2,000 | ₹3,000–8,000 |
| Storage (R2) | ₹500–2,000 | ₹2,000–6,000 |
| Bandwidth | R2 par ~₹0 egress | CDN par usage-based |
| OTP SMS | ~₹0.20/SMS ke hisaab se | usage-based |
| DRM license | ₹0 (AES-128 se start) | ₹8,000–40,000 (Widevine) |
| **Total** | **~₹5,000–12,000/mo** | **~₹25,000–70,000/mo** |

**Video bandwidth sabse bada kharcha hai** — isiliye R2 (zero egress) recommend kiya hai. Ye estimates hain; actual usage par depend karenge.

## 12. Security Limitations (imandari se — zaroor padhein)

1. **Doosre camera/phone se recording** — koi bhi software ise nahi rok sakta. Hathiyaar: moving watermark (leaker ki pehchaan), Terms of Service + legal deterrent.
2. **Rooted device** — determined attacker bypass kar sakta hai; Play Integrity + root detection se *mushkil* karo, *impossible* mat samjho.
3. **FLAG_SECURE** — normal screenshot/recording block karta hai, lekin kuch custom ROMs ya HDMI-capture edge cases me leak ho sakta hai.
4. **PDF text** — bitmap rendering copy rokta hai, lekin screen ki photo ka OCR text nikal sakta hai → watermark + legal hi jawab hai.
5. **Asli maksad:** casual piracy ko *practically impossible* aur determined piracy ko *traceable + mushkil* banana. **100% guarantee koi nahi de sakta** — jo de, wo jhooth bol raha hai. Aapne prompt me ye khud likha, aur yehi sahi engineering mindset hai.

## 13. Technology Choices — kyun yehi?

- **Kotlin + Jetpack Compose:** Google ka official modern stack; secure APIs (PdfRenderer, FLAG_SECURE, Media3) ka sabse achha support.
- **NestJS (TypeScript):** modular (auth/content/admin alag modules), typed, badi scale par maintainable. Python team ho to FastAPI bhi valid.
- **PostgreSQL:** permissions + analytics jaise relational data ke liye sahi; JSONB flexible metadata ke liye.
- **Cloudflare R2:** video bandwidth par **zero egress fee** = sabse bada cost saver.
- **HLS + (baad me) Widevine:** industry-standard streaming security.

---

## 14. Development Roadmap (step-by-step)

| Stage | Kaam | Testing instructions |
|---|---|---|
| **1. Backend foundation** | DB schema, auth (OTP + email), users/devices APIs | Postman se signup → OTP verify → login → device limit test |
| **2. Content APIs + storage** | Categories, PDF/video metadata, presigned upload/download, permission checks | Admin upload → signed URL lo → 5 min baad kholo → **403 aana chahiye** |
| **3. Admin panel MVP** | Login, dashboard cards, content CRUD, user block/unblock | Browser me har button ka flow manually test |
| **4. Android app MVP** | Login, home, secure PDF viewer (FLAG_SECURE, no-copy) | Doosre phone se screenshot try karo → **black screen** aani chahiye; text select nahi hona chahiye |
| **5. Video + DRM + watermark** | HLS pipeline, ExoPlayer, moving watermark | Manifest URL copy karke browser me kholo → **nahi chalna chahiye** |
| **6. Analytics + alerts** | Events pipeline, dashboards, security alerts | App use karo → dashboard numbers badhne chahiye |
| **7. Hardening** | Root detection, cert pinning, rate limits, audit review | Security checklist ka final review |

**Rule:** Har stage complete hone ke baad main testing instructions dunga, aap verify karoge, **phir** agla stage shuru hoga.

---

## Meri taraf se kya banega / aapko kya karna hoga

**Main banaunga:** poora codebase — backend API, database migrations, web admin panel, Android app (Kotlin). Backend + admin panel yahan **run karke live demo** dikhaunga. Android code **Android Studio me kholne layak** complete milega.

**Aapko karna hoga:** APK build + signing aapki machine par (Android Studio — main step-by-step guide karunga), Google Play account (agar Play par dalna ho), aur hosting accounts (VPS/domain) jab deployment stage aaye.

**Aapki taraf se jo extra cheezein zaroori hongi** (main plan me add kar chuka hun): FCM push notifications, Help/Support screen, banner/notice manager, content expiry — ye sab roadmap me covered hai.
