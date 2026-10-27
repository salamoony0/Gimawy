# Gymawy

Mobile-first fitness tracker (installable PWA): strength workouts, cardio (incl. incline treadmill), body weight + goals, calorie/macro targets from a setup wizard, calorie-burn estimates, and AI food logging from photos/labels/screenshots via Google Gemini (free tier).

The owner uses it alone for now and plans to **publish it publicly later** (Vercel for the client + Render for the API), so keep auth, per-user data isolation and rate limits correct.

## ⚠️ Keep this file current

**After every change to the app, update this file in the same task**: new/renamed files, routes, models, env vars, commands, conventions, decisions, and the changelog at the bottom. If something here is wrong, fix it here too. This is the single source of truth for future sessions.

## 🚧 Status (read this first when resuming)

The roadmap in **[PLAN.md](PLAN.md)** is implemented: all 4 phases are merged into `main` (each phase was its own branch + commit). Only steps that need the owner's own accounts remain:

**Owner's manual steps to go live** (in order, details in Deploying):
1. ~~Push to GitHub~~ ✅ done: https://github.com/salamoony0/Gimawy (SSH key `~/.ssh/id_ed25519` on this Mac; `git push` works without prompts).
2. Create a Supabase project; copy the transaction pooler URL (→ `DATABASE_URL`) and session pooler URL (→ `DIRECT_URL`).
3. Render → New → Blueprint → this repo (`render.yaml`); fill the `sync: false` env vars.
4. Vercel → New Project → this repo, root directory `client`. If Render's URL isn't `gymawy-api.onrender.com`, update `client/vercel.json`.
5. Resend: get an API key (and verify a sending domain, or you can only email yourself); set `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` on Render.
6. Verify on the live URL, on desktop **and iPhone Safari**: register → setup → log workout → scan meal → reload (session survives); reset email arrives; `/api/health` works through the rewrite; 11th bad login → 429.

What each phase did (2026-10-27):
- **Phase 1, editing:** `PUT /workouts/:id`, `PUT /routines/:id`, `PATCH /cardio|food|goals/:id`, `PATCH`+`DELETE /exercises/:id` (custom only; 409 if used). Client: workout edit mode (`workoutStore.startEdit`), `EditFoodSheet`, `CardioSheet`/`GoalSheet` `initial` prop, `components/RoutineEditor.tsx`, `CustomExerciseSheet`.
- **Phase 2, security:** see Conventions → Security.
- **Phase 3, tests:** see Testing.
- **Phase 4, deploy prep:** Postgres everywhere with Prisma migrations, local embedded Postgres for dev/tests/E2E, seed split (`library` / `demo`), `render.yaml`, `client/vercel.json`, demo button only when the demo account exists. Verified a production build (`NODE_ENV=production`, same-origin proxy) in Chrome: `Secure; HttpOnly; SameSite=Lax` cookie, session survives reload, SPA deep links work.

## Commands (run from repo root)

```bash
npm install            # npm workspaces: server + client (+ embedded Postgres binaries)
npm run setup          # local Postgres: apply migrations + seed (library + demo account)
npm run dev            # local Postgres :5433 + API :4000 + Vite :5173 (proxy /api → :4000)
npm run db             # only the local Postgres (data in server/.postgres)
npm run build          # server tsc + client tsc/vite build
npm run seed -w server # library + rebuild demo account (other accounts untouched)
npm run seed:library -w server   # library only (idempotent; runs on every deploy)
npm run db:migrate -w server     # prisma migrate deploy (apply committed migrations)
npm run db:migration -w server -- --name <name>   # after editing schema.prisma: create a migration (needs `npm run db`)
npx tsc -p client --noEmit  # client typecheck
npm run typecheck -w server # server typecheck (src + test/)
npm test               # Vitest: server unit + API tests, then client unit tests
npm run test:e2e       # Playwright E2E in system Chrome (starts its own API :4100 + Vite :5174)
```

Demo login: **demo@gymawy.app / demo1234** (12 weeks of data, already onboarded).

Environment notes: Node.js v24 is installed at `/usr/local/bin/node` (official installer; no Homebrew, no GitHub CLI, no Docker). Google Chrome is installed (E2E uses it via `channel: 'chrome'`). The old SQLite `server/prisma/dev.db` is kept only as a backup (gitignored); its one real account (`test@gmail.com`) was copied into Postgres.

Git: `main`, remote `origin` → `git@github.com:salamoony0/Gimawy.git` (SSH) (its placeholder README commit was merged in with `-s ours`). Commit messages end with the Claude co-author line. `.env`, `*.db`, `dist`, `.claude/settings.local.json` and `*.tsbuildinfo` are ignored — never commit secrets.

npm in this repo uses `allowScripts` (root package.json) — only prisma, @prisma/*, esbuild, fsevents and `@embedded-postgres/{darwin-arm64,linux-x64}` (recreates dylib symlinks) may run install scripts. New packages with install scripts must be approved with `npm install-scripts approve <pkg>`.

## Testing

- **Unit** (Vitest): `client/src/lib/*.test.ts` (energy known answers, date helpers, pace) and `server/test/unit.test.ts` (e1rm, weekStart, annotateWorkouts PR rules, withTrend). Keep math pure and exported so it can be tested.
- **API** (`server/test/*.test.ts`, supertest against `app`): run one file at a time. `global-setup.ts` starts a throwaway embedded Postgres on a free port (or uses `TEST_DATABASE_URL`, which must be empty), runs `migrate deploy`, and hands the URL to workers via `provide`/`inject` (`setup-env.ts`). `RATE_LIMIT=off` except in `ratelimit.test.ts`; Gemini (`vi.mock('@google/genai')`) and `sendMail` are mocked. **Every new user-owned route needs a case in `isolation.test.ts`.**
- **E2E** (`tests/e2e/*.spec.ts`, `@playwright/test`, `channel: 'chrome'`): `playwright.config.ts` starts the API on :4100 via `start-api.mjs` (throwaway Postgres on a free port, migrated + seeded; URL written to `tests/e2e/.db-url`) and Vite on :5174 (`API_PORT` env sets the proxy target). The `errors` fixture fails a test on any console error except 401/403/404/409. Specs: core (demo logging), onboarding, editing, account.
- Prisma blocks destructive commands (`db push --force-reset`, `migrate reset`) from AI agents without the user's explicit consent, so test setups always start from a brand-new database instead of resetting one.

## Stack

- **client/**: React 19, Vite 8, TypeScript 7, Tailwind v4 (`@tailwindcss/vite`, tokens in `src/index.css` `@theme`), React Router 8 (`react-router`), TanStack Query 5, Recharts 3, Motion 14 (`motion/react`), lucide-react 1.x (icon names differ from older versions, e.g. `Trash` not `Trash2`), vite-plugin-pwa.
- **server/**: Node 24, Express 5 (async errors auto-forwarded), Prisma 6 (Postgres: Supabase in prod, `embedded-postgres` locally; migrations in `prisma/migrations`), Zod 4, bcryptjs, jsonwebtoken (httpOnly cookie `gymawy_token`, 30d), multer 2 (memory uploads), `@google/genai`.
- ESM everywhere. Server imports use `.js` extensions (nodenext).

## Layout

```
scripts/                   postgres.mjs (startPostgres/freePort/pgUrl via embedded-postgres), dev-db.mjs (`npm run db`),
                           with-db.mjs (run a command with the dev DB up)
render.yaml                Render Blueprint for the API
playwright.config.ts, tests/e2e/   E2E specs, fixtures.ts, start-api.mjs
client/vercel.json         /api rewrite to Render + SPA fallback + headers
server/
  prisma/schema.prisma     data model (see below); provider postgresql, url + directUrl
  prisma/migrations/       committed SQL migrations (20261027000000_init)
  prisma/seed.ts           `library` (69 exercises, idempotent) or `demo` (+ demo account, deterministic PRNG)
  test/                    Vitest: unit.test.ts, auth/isolation/workouts/ai/reset/ratelimit API suites (supertest),
                           helpers.ts (newUser agent, libraryExercise, workoutBody), env.ts, global-setup.ts, setup-env.ts
  src/app.ts               Express app (exported for tests): helmet, CORS, limiters, /api/auth, /api/stats, /api/ai, /api
  src/index.ts             only calls app.listen
  src/lib/core.ts          prisma client, HttpError, errorHandler, auth cookie + requireAuth (checks tokenVersion), DEMO_EMAIL, zDay, date math, e1rm
  src/lib/limits.ts        express-rate-limit limiters (account/IP/forgot/register/api/ai)
  src/lib/mailer.ts        sendMail() via Resend REST (logs to console without a key), appUrl()
  src/lib/training.ts      loadTraining() → annotateWorkouts() (pure: e1RM, PR flags, volume), assertExercisesVisible()
  src/lib/trend.ts         withTrend(): trailing 7-day weight average
  src/routes/auth.ts       register/login/logout, GET/PATCH/DELETE /me (+ latestWeightKg), forgot, reset, PATCH password,
                           logout-all, GET export, GET demo (is the demo account seeded?)
  src/routes/training.ts   exercises (+history, /last), workouts CRUD, routines
  src/routes/tracking.ts   cardio, body weight (PUT /body/:date upsert), goals (progress computed), food (+summary, recent)
  src/routes/stats.ts      /stats/dashboard, /stats/progress?range=30|90|365|all
  src/routes/ai.ts         /ai/status, /ai/analyze-food (image and/or text hint → JSON draft), DB daily quota
client/src/
  main.tsx                 router, QueryClient (every mutation invalidates all queries; a delete
                           whose page stays mounted sets `meta: { removes: queryKey }` to skip refetching it), auth gates
  lib/api.ts               fetch wrapper + all response types (mirror server shapes here)
  lib/format.ts            local-day helpers, number formatting, useMe(), useUnits()
  lib/energy.ts            BMR/TDEE/targets/macros + cardio & strength burn estimates (single source of truth)
  lib/activeWorkout.ts     in-progress workout store (localStorage + useSyncExternalStore)
  components/ui.tsx        Button/buttonClass, IconButton, Field, Input, Select, Segmented, Sheet, Toast, Stat, Bar, Badge…
  components/viz.tsx       Rings, MacroLegend, Heatmap, ChartTooltip, axis/grid props, GradientDefs
  components/Layout.tsx    sidebar (lg) / header + bottom nav (mobile), active-workout pill, PageHeader, Logo
  components/ExercisePicker.tsx  searchable picker sheet + custom exercise creation, useExercises()
  pages/                   Auth, Recover (/forgot + /reset), Onboarding (/setup), Today, Train (strength/cardio/exercises tabs, CARDIO_META),
                           WorkoutLogger (/train/log), WorkoutDetail, ExerciseDetail, Food (scan + manual sheets),
                           Body (weigh-in, trend, goals), Progress, Settings
```

## Data model (Prisma)

- **User**: credentials, units (`weightUnit` kg|lb, `distanceUnit` km|mi), targets (calorie/protein/carbs/fat/weeklyWorkout), profile (`sex`, `birthDate`, `heightCm`, `activityLevel`, `goal` lose|maintain|gain, `goalRateKg`), `onboarded`.
- **Exercise** (`userId` null = built-in library), **Workout** → **WorkoutExercise** → **WorkoutSet** (`weightKg`, `reps`, `rpe`, `isWarmup`); Workout has `calories`.
- **Routine** → **RoutineExercise** (targetSets/targetReps).
- **CardioSession**: `type` run|walk|incline|cycle|row|swim|elliptical|stairs|hiit|other, `durationMin`, `distanceKm`, `calories`, `avgHeartRate`, `inclinePct`, `speedKmh`.
- **User.tokenVersion**: in every JWT; bumping it signs out all sessions. **AiUsage** (userId, UTC day, count; unique [userId,day]). **PasswordResetToken** (SHA-256 `tokenHash`, `expiresAt` 1 h, `usedAt`).
- **BodyWeight** (one per user per day, unique [userId,date]), **Goal** (`type` weight|lift|cardio, `targetValue` kg or min/week, `startValue` snapshot), **FoodEntry** (one row per item; `meal`, `source` manual|label|screenshot|photo|text).

## Conventions & rules

- **Units**: store metric only (kg, km, km/h). Convert at the edges with `useUnits()` (`weight/toKg`, `dist/toKm`, `pace`). Weights saved with 2 decimals so lb round-trips.
- **Days** are `YYYY-MM-DD` strings in the user's local calendar (`localDay()` on the client; server receives `?today=`). Never derive calendar days from server time.
- **PR** = best e1RM (Epley) set of a session that beats every earlier set of that exercise; first-ever session only sets the baseline.
- **Weight trend** = trailing 7-calendar-day mean of weigh-ins.
- **Targets** (onboarding, `lib/energy.ts`): Mifflin-St Jeor BMR × activity factor (1.2/1.375/1.55/1.725/1.9) ± goalRate×7700/7; floor 1500 (m) / 1200 (f). Protein 2.2 g/kg cutting, 1.8 otherwise (cap 260); fat 25% kcal; carbs remainder.
- **Burn estimates** (`lib/energy.ts`, computed client-side and stored): cardio uses heart rate (Keytel) if HR+age+sex known → else ACSM walking/running equations from speed+incline for walk/run/incline → else MET × 3.5 × kg × min / 200. Strength = MET 5.0. Body weight = latest weigh-in (`me.latestWeightKg`, fallback 75 kg). Daily calorie targets already include activity, so exercise calories are **not** added back to the food budget.
- **AI**: model `GEMINI_MODEL` (default `gemini-3.1-flash-lite`, ~2–3 s) → fallback `gemini-3-flash-preview`, thinking LOW, 25 s timeout per attempt, per-user daily cap `AI_DAILY_LIMIT` (refunded on failure). Responses validated with Zod; the UI always shows an editable draft — never auto-save AI output. Client downsizes images to 1280px JPEG before upload. `gemini-flash-latest` was too slow (45 s+) and gemini-2.5-* are closed to new keys.
- **UI**: green-on-black tokens only (no raw hex in components except chart series/cardio colors); Barlow / Barlow Condensed (`font-display`), `.num` for tabular numbers; 44px+ touch targets; `Sheet` for modals; links styled as buttons via `buttonClass()` (never nest `<button>` in `<a>`); respect reduced motion (`MotionConfig reducedMotion="user"`). Design system came from the `ui-ux-pro-max` skill (fitness, Vibrant & Block-based, Barlow), recoloured green/black.
- **Security**:
  - Sessions: JWT `{ sub, v: tokenVersion }` in an httpOnly `SameSite=Lax` cookie (`Secure` in prod); `requireAuth` looks up the user on each request and rejects stale versions. Password change/reset and "log out everywhere" bump the version (change/reset re-issue the current cookie).
  - Cookie is `SameSite=Lax` because production is same-site: the browser only talks to Vercel, which rewrites `/api/*` to Render (third-party cookies would break login on Safari/iOS). CORS is only mounted when `CLIENT_ORIGIN` is set (cross-origin `VITE_API_URL` setups).
  - Rate limits (`lib/limits.ts`, in memory, single instance): login 10 failed/15 min per email + 100 failed/15 min per IP; forgot 5/h per email; register 20/h per IP; signed-in API 300/min per user; AI 10/min per user (plus the daily cap). `RATE_LIMIT=off` disables them (tests). `TRUST_PROXY` sets proxy hops for `req.ip` (default 1 in prod; `render.yaml` sets 2 for Vercel → Render). Requests sent straight to the Render URL can spoof `X-Forwarded-For` and dodge the per-IP limiter; the per-email account limiter still applies.
  - `/auth/forgot` always returns 200 (no account enumeration); login compares against a dummy hash when the email is unknown. Passwords are 8–72 chars (bcrypt limit).
  - The demo account (`DEMO_EMAIL`) can't change its password, get reset emails or be deleted (403). The login page only shows "Explore the demo account" when `GET /auth/demo` says it exists (production: `SEED_DEMO=1`, rebuilt on every deploy).
  - The auth guards in `main.tsx` (`useSession`) only show a spinner before the first `/me` response; otherwise a refetch would unmount guest pages.
- New accounts are forced through `/setup` until `onboarded` is true; Settings → "Recalculate targets" reopens it.
- Empty states and a "Get set up" checklist exist so new accounts never look blank; demo data comes from the seed.
- Chart margins: don't use negative `left` margins (they clip y-axis labels).

## Environment (server/.env, see .env.example)

`DATABASE_URL` (pooled), `DIRECT_URL` (migrations; same as DATABASE_URL locally), `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN` (comma-separated, only for cross-origin clients), `GEMINI_API_KEY` (free: aistudio.google.com/apikey), `GEMINI_MODEL`, `AI_DAILY_LIMIT`, `RESEND_API_KEY` (optional in dev: reset links are logged), `MAIL_FROM`, `APP_URL` (client URL for emailed links), `TRUST_PROXY`, `RATE_LIMIT` (`off` for tests), `SEED_DEMO` (Render build: `1` seeds the demo account). Client: `VITE_API_URL` (only for a cross-origin API; dev uses the Vite proxy and production the Vercel rewrite). E2E/dev tooling: `API_PORT` (Vite proxy target), `TEST_DATABASE_URL`. Never commit `.env`.

## Deploying (Supabase + Render + Vercel)

Configured in the repo, not yet live (needs the owner's accounts; see Status).

- **Supabase** (database): Project → Connect → ORMs → Prisma gives both URLs. `DATABASE_URL` = transaction pooler (`…pooler.supabase.com:6543/postgres?pgbouncer=true`), `DIRECT_URL` = session pooler (`…pooler.supabase.com:5432/postgres`); the direct `db.<ref>.supabase.co` host is IPv6-only, which Render can't reach. Free projects pause after 7 days without activity (resume from the dashboard).
- **Render** (API, `render.yaml` Blueprint): build `npm ci --include=dev && npm run build -w server && npm run db:migrate -w server && npm run seed:library -w server` (+ demo when `SEED_DEMO=1`), start `npm start -w server`, health check `/api/health`. `JWT_SECRET` is generated. Free tier sleeps after 15 min idle, so the first request takes ~30–50 s. Migrations run on every deploy (`migrate deploy` is a no-op when up to date).
- **Vercel** (client): root directory `client` (Vite preset, `client/vercel.json`). `/api/:path*` is rewritten to `https://gymawy-api.onrender.com/api/:path*` (update it if Render's URL differs), everything else falls back to `index.html`; `sw.js` is `no-cache`, `/assets` immutable. No env vars are needed.
- Schema changes: edit `schema.prisma`, run `npm run db` and `npm run db:migration -w server -- --name <name>`, commit the new folder in `prisma/migrations`. Render applies it on the next deploy.

## Ideas / backlog

Progress photos, body measurements, offline logging queue, plate calculator, supersets, data export (CSV), barcode scanning, adaptive TDEE from weight trend + intake.

## Changelog

- **2026-10-27** — Initial build: monorepo, auth, exercise library, workout logger (previous values, rest timer, warm-ups, routines), workout/exercise detail with PRs, cardio, body weight trend + goals, food log + Gemini scan, dashboard, progress analytics, settings/units, PWA, demo seed.
- **2026-10-27** — AI: switched default to `gemini-3.1-flash-lite` with fallback, timeouts, and quota refunds (scans went from 45 s+ to ~3 s).
- **2026-10-27** — Onboarding wizard (`/setup`): sex, DOB, height, weight, activity, goal + pace + optional target weight → computed calorie/macro targets, initial weigh-in and weight goal. Calorie-burn estimates for cardio (HR/ACSM/MET) and strength (MET), shown on dashboard, workout detail, logger summary and progress. New `incline` cardio type with incline % and speed fields (also for walk/run), presets (12-3-30 etc.).
- **2026-10-27** — Git repository initialised (initial commit of the full app).
- **2026-10-27** — Phase 1 (edit saved items): edit workouts, food, cardio, routines (create/reorder), goals, and custom exercises (edit/delete). Verified in the browser and merged into `main`. Also fixed a 404 refetch after deleting a workout or custom exercise (`meta.removes` in the global mutation handler).
- **2026-10-27** — Phase 2 (publish-ready security): helmet, rate limits, DB-backed AI quota, tokenVersion sessions, forgot/reset password (Resend), change password, log out everywhere, data export, account deletion, Settings → Account & security card, `/forgot` + `/reset` pages. Split `app.ts` from `index.ts`. Cookie is now `SameSite=Lax` (prod will use a same-site Vercel rewrite). Fixed auth guards unmounting pages on `/me` refetch.
- **2026-10-27** — Phase 3 (automated tests): Vitest (client + server), supertest API suites incl. cross-user isolation, Playwright E2E in system Chrome. Refactors: `annotateWorkouts`, `lib/trend.ts`, `formatPace` (fixed 4:60 rounding), `assertExercisesVisible` in lib (now also guards lift goals). Root package is `"type": "module"`.
- **2026-10-27** — Phase 4 (deploy prep): SQLite → Postgres with Prisma migrations (`directUrl` for Supabase), local `embedded-postgres` for dev (`npm run db`, part of `npm run dev`), API tests and E2E (throwaway clusters on free ports). Seed split into `library`/`demo`. `render.yaml`, `client/vercel.json`, `GET /auth/demo` + demo button gating, CORS only with `CLIENT_ORIGIN`. Fixed E2E races (forgot page, toast text).
