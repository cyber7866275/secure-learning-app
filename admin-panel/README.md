# SecureLearn Admin Panel (Stage 6 — Analytics + Security Alerts)

Web admin dashboard for the SecureLearn content platform. Next.js 16 (App Router)
+ TypeScript + Tailwind CSS v4 + recharts.

## Setup

```bash
cd ~/workspace/secure-learning-app/admin-panel
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL if backend isn't on localhost:3000
npm run dev                  # http://localhost:3001 (or next free port)
```

The backend must be running first:

```bash
cd ~/workspace/secure-learning-app/backend
docker compose up -d
npx prisma migrate dev --name stage3   # includes the new app_settings table
npm run seed && npm run start:dev
```

Sign in with the seed owner admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## Pages

| Route       | What it does |
|-------------|--------------|
| `/login`    | Admin email+password → `POST /auth/admin/login` |
| `/`         | Dashboard: totals + today's activity from `GET /admin/analytics/overview`; timeseries chart (opens/plays/watch-time/logins/signups × 7/14/30d) from `GET /admin/analytics/timeseries`; PDFs-by-status pie; recent users/PDFs |
| `/content`  | PDFs / Videos / Taxonomy tabs — upload (presigned PUT + progress), edit, publish/unpublish/hide, replace (2-step), delete, taxonomy CRUD. Each row is expandable: click ▶ to lazily load per-content analytics (`GET /admin/analytics/content/:contentType/:id`) — opens, unique users, watch time, last opened |
| `/users`    | Searchable user table, new-user dialog |
| `/users/:id`| Block/unblock, max devices, access expiry, revoke all sessions, per-device remote logout, permission grants, **Activity** section (`GET /admin/analytics/users/:userId`) — PDFs opened, videos played, watch time, last active, last 20 events |
| `/security` | Security alerts feed (unseen filter + mark-seen), login-attempts table (success filter), denied-access table (`GET /admin/security/alerts`, `/login-attempts`, `/denied-attempts`) |
| `/banners`  | Home-page banner CRUD |
| `/settings` | Security toggles + device-limit defaults (`GET`/`PUT /admin/settings`) |

## Test plan (manual, browser)

1. **Login** — sign in with the seed admin; wrong password shows the backend error.
2. **Dashboard** — totals match the backend (`/admin/users?limit=1` etc.); charts render.
3. **Upload a PDF** — Content → Upload PDF → fill title + taxonomy → choose file →
   progress bar → success toast. Then **Publish** it.
4. **Grant a permission** — Users → pick user → Manage → grant PDF access with an
   expiry → permission appears in the list → Revoke it.
5. **Block/unblock** — user detail → Block user → badge flips to BLOCKED →
   Unblock.
6. **Revoke a device** — user detail → Devices → Revoke → device shows revoked.
7. **Banners** — create → shows in list → deactivate → badge flips → delete.
8. **Settings** — flip a toggle → Save → reload the page → value persisted.
9. **Session expiry** — the access token lives in memory only; reload the page and
   the client silently refreshes via `POST /auth/refresh` (check Network tab).
10. **Analytics** — generate activity in the Android app (open a PDF, play a video,
    watch ≥ 1 min so heartbeats fire), wait for the event batch to upload (~15 min
    via WorkManager, or force a sync in the app), then reload `/` — "Opens today",
    "Plays today" and "Watch time today" should move. Switch the chart metric to
    *Watch time* and the range to *7d* to see the timeseries.
11. **Content stats** — `/content` → expand a row with ▶ → opens/unique users/
    watch time load lazily from `GET /admin/analytics/content/:contentType/:id`.
12. **User activity** — `/users/:id` → Activity section shows PDFs opened, videos
    played, total watch time, last active and the last 20 events.
13. **Security** — `/security`: the alerts feed shows backend security alerts
    (e.g. refresh-token reuse, denied-access bursts) with unseen highlight; use
    *Mark seen* and the *Unseen only* toggle. Trigger a failed login in the app →
    it appears in the login-attempts table (filter: Failed only). Revoke a user's
    permission (or have a user with no grant) and open content → the denied request
    shows up in the denied-access table with the server-side reason and IP.

## Stage 6 notes

Stage 6 closed the old gaps with real read-only backend endpoints
(`backend/src/analytics/analytics.controller.ts`,
`backend/src/security/security.controller.ts`):

- `GET /admin/analytics/overview` — totals + today's activity + unseen-alert count.
- `GET /admin/analytics/timeseries?metric=…&days=…` — server-bucketed, zero-filled
  daily series (no client-side bucketing workaround).
- `GET /admin/analytics/content/:contentType/:id` — per-content stats.
- `GET /admin/analytics/users/:userId` — per-user activity.
- `GET /admin/security/alerts?unseenOnly=&page=&limit=` + `PATCH /admin/security/alerts/:id/seen`.
- `GET /admin/security/login-attempts?success=&page=&limit=`.
- `GET /admin/security/denied-attempts?page=&limit=` — the unauthorized-access metric
  (`content_events` with `event = access_denied`; the app has no download feature,
  so denied /access requests are what this surfaces).

Nothing in the UI calls a guessed URL; every fetch maps to a real backend route
(see `lib/api.ts` call sites). Time ranges on charts are fixed server windows
(the app uploads events in batches, so today is always partial).

## Notes

- No linear gradients anywhere (design rule) — solid slate/emerald palette.
- No hardcoded credentials or URLs — only `NEXT_PUBLIC_API_URL` with a dev default.
- Auth: access token in memory, refresh token in `localStorage`; 401 → one
  silent refresh retry → redirect to `/login` on failure.
