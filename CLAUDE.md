# Gymawy

Mobile-first fitness tracker (installable PWA): strength workouts, cardio (incl. incline treadmill), body weight + goals, calorie/macro targets from a setup wizard, calorie-burn estimates, and AI food logging from photos/labels/screenshots via Google Gemini (free tier).

The owner uses it alone for now and plans to **publish it publicly later** (Vercel for the client + Render for the API), so keep auth, per-user data isolation and rate limits correct.

## ⚠️ Keep this file current

**After every change to the app, update this file in the same task**: new/renamed files, routes, models, env vars, commands, conventions, decisions, and the changelog at the bottom. If something here is wrong, fix it here too. This is the single source of truth for future sessions.

## 🚧 Work in progress (read this first when resuming)

The approved roadmap is in **[PLAN.md](PLAN.md)**, 4 phases, each shipped as its own commit on its own branch:
1. ~~Edit saved items~~ ✅ done, merged into `main`
2. ~~Publish-ready security~~ ✅ done, merged into `main`
3. ~~Automated tests~~ ✅ done, merged into `main`
4. **Deploy** ← *next, on branch `phase-4-deploy`*: **Supabase** Postgres (pooled `DATABASE_URL` + `DIRECT_URL`, switch to `prisma migrate`), Render API, Vercel client with an `/api` rewrite (first-party cookies for Safari)

**Phase 1 (done 2026-10-27, verified in the browser with flow3 and no console errors; flow and flow2 still pass):**
- **Server:** `PUT /workouts/:id`, `PUT /routines/:id`, `PATCH /cardio|food|goals/:id`, `PATCH`+`DELETE /exercises/:id` (custom only; 409 if used in a workout).
- **Client:**
  - workout edit mode (`workoutStore.startEdit`, Edit button on WorkoutDetail, logger shows an "Editing" badge, a date picker, and saves with PUT)
  - food `EditFoodSheet` (tap an entry)
  - `CardioSheet` `initial` prop (tap a session)
  - `components/RoutineEditor.tsx` ("New routine" + pencil on cards)
  - `CustomExerciseSheet` on ExerciseDetail
  - `GoalSheet` `initial` prop (pencil on goal cards)

**Phase 2 (done 2026-10-27, verified with flow4 + curl; flows 1–3 still pass):** rate limits + helmet, AI quota in the `AiUsage` table, `tokenVersion` sessions, forgot/reset (Resend or server log), change password, log out everywhere, JSON export, account deletion, demo account protected. See Conventions → Security.

**Phase 3 (done 2026-10-27):** 17 client unit tests, 35 server tests (unit + supertest API incl. cross-user isolation), 4 Playwright E2E specs (replaced the old `tests/e2e-drafts` scripts). See Testing. Found and fixed along the way: lift goals accepted another user's custom exercise id; `pace` showed "4:60" instead of "5:00".

**Next step:** Phase 4 per PLAN.md, on branch `phase-4-deploy`.

## Commands (run from repo root)

```bash
npm install            # npm workspaces: server + client
npm run setup          # prisma db push + seed (library + demo account)
npm run dev            # API :4000 + Vite :5173 (proxy /api → :4000)
npm run build          # server tsc + client tsc/vite build
npm run seed -w server # rebuild demo account only (other accounts untouched)
npm run db:push -w server   # apply schema.prisma changes (SQLite, no migrations yet)
npx tsc -p client --noEmit  # client typecheck
npm run typecheck -w server # server typecheck (src + test/)
npm test               # Vitest: server unit + API tests, then client unit tests
npm run test:e2e       # Playwright E2E in system Chrome (starts its own API :4100 + Vite :5174)
```

Demo login: **demo@gymawy.app / demo1234** (12 weeks of data, already onboarded).

Environment notes: Node.js v24 is installed at `/usr/local/bin/node` (official installer; no Homebrew, no GitHub CLI). Google Chrome is installed; UI was verified by driving it headlessly with `playwright-core` from the session scratchpad (not a project dependency).

Git: repo initialised on `main`. Commit messages end with the Claude co-author line. `.env`, `*.db`, `dist`, `.claude/settings.local.json` and `*.tsbuildinfo` are ignored — never commit secrets.

npm in this repo uses `allowScripts` (root package.json) — only prisma, @prisma/*, esbuild, fsevents may run install scripts. New packages with install scripts must be approved with `npm install-scripts approve <pkg>`.

## Testing

- **Unit** (Vitest): `client/src/lib/*.test.ts` (energy known answers, date helpers, pace) and `server/test/unit.test.ts` (e1rm, weekStart, annotateWorkouts PR rules, withTrend). Keep math pure and exported so it can be tested.
- **API** (`server/test/*.test.ts`, supertest against `app`): run one file at a time on a throwaway DB that `global-setup.ts` recreates (`TEST_DATABASE_URL`, default SQLite `prisma/test.db`). `RATE_LIMIT=off` except in `ratelimit.test.ts`; Gemini (`vi.mock('@google/genai')`) and `sendMail` are mocked. **Every new user-owned route needs a case in `isolation.test.ts`.**
- **E2E** (`tests/e2e/*.spec.ts`, `@playwright/test`, `channel: 'chrome'`): `playwright.config.ts` starts the API on :4100 with `prepare-db.mjs` (fresh `e2e.db` + seed) and Vite on :5174 (`API_PORT` env sets the proxy target). The `errors` fixture fails a test on any console error except 401/403/404/409. Specs: core (demo logging), onboarding, editing, account.
- Prisma blocks `db push --force-reset` from AI agents without the user's explicit consent, so test setups delete the throwaway DB file and run a plain `db push` instead.

## Stack

- **client/**: React 19, Vite 8, TypeScript 7, Tailwind v4 (`@tailwindcss/vite`, tokens in `src/index.css` `@theme`), React Router 8 (`react-router`), TanStack Query 5, Recharts 3, Motion 14 (`motion/react`), lucide-react 1.x (icon names differ from older versions, e.g. `Trash` not `Trash2`), vite-plugin-pwa.
- **server/**: Node 24, Express 5 (async errors auto-forwarded), Prisma 6 (SQLite locally → Postgres in prod), Zod 4, bcryptjs, jsonwebtoken (httpOnly cookie `gymawy_token`, 30d), multer 2 (memory uploads), `@google/genai`.
- ESM everywhere. Server imports use `.js` extensions (nodenext).

## Layout

```
server/
  prisma/schema.prisma     data model (see below)
  prisma/seed.ts           69-exercise library + demo account (deterministic PRNG)
  test/                    Vitest: unit.test.ts, auth/isolation/workouts/ai/reset/ratelimit API suites (supertest),
                           helpers.ts (newUser agent, libraryExercise, workoutBody), env.ts, global-setup.ts
  src/app.ts               Express app (exported for tests): helmet, CORS, limiters, /api/auth, /api/stats, /api/ai, /api
  src/index.ts             only calls app.listen
  src/lib/core.ts          prisma client, HttpError, errorHandler, auth cookie + requireAuth (checks tokenVersion), DEMO_EMAIL, zDay, date math, e1rm
  src/lib/limits.ts        express-rate-limit limiters (account/IP/forgot/register/api/ai)
  src/lib/mailer.ts        sendMail() via Resend REST (logs to console without a key), appUrl()
  src/lib/training.ts      loadTraining() → annotateWorkouts() (pure: e1RM, PR flags, volume), assertExercisesVisible()
  src/lib/trend.ts         withTrend(): trailing 7-day weight average
  src/routes/auth.ts       register/login/logout, GET/PATCH/DELETE /me (+ latestWeightKg), forgot, reset, PATCH password,
                           logout-all, GET export
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
  - Rate limits (`lib/limits.ts`, in memory, single instance): login 10 failed/15 min per email + 100 failed/15 min per IP; forgot 5/h per email; register 20/h per IP; signed-in API 300/min per user; AI 10/min per user (plus the daily cap). `RATE_LIMIT=off` disables them (tests). `TRUST_PROXY` sets proxy hops for `req.ip` (default 1 in prod; behind the Vercel rewrite check that `req.ip` is the real client, see Deploying).
  - `/auth/forgot` always returns 200 (no account enumeration); login compares against a dummy hash when the email is unknown. Passwords are 8–72 chars (bcrypt limit).
  - The demo account (`DEMO_EMAIL`) can't change its password, get reset emails or be deleted (403).
  - The auth guards in `main.tsx` (`useSession`) only show a spinner before the first `/me` response; otherwise a refetch would unmount guest pages.
- New accounts are forced through `/setup` until `onboarded` is true; Settings → "Recalculate targets" reopens it.
- Empty states and a "Get set up" checklist exist so new accounts never look blank; demo data comes from the seed.
- Chart margins: don't use negative `left` margins (they clip y-axis labels).

## Environment (server/.env, see .env.example)

`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN` (comma-separated, for CORS with credentials), `GEMINI_API_KEY` (free: aistudio.google.com/apikey), `GEMINI_MODEL`, `AI_DAILY_LIMIT`, `RESEND_API_KEY` (optional in dev: reset links are logged), `MAIL_FROM`, `APP_URL` (client URL for emailed links), `TRUST_PROXY`, `RATE_LIMIT` (`off` for tests). Client: `VITE_API_URL` (only in production; dev uses the Vite proxy). Never commit `.env`.

## Deploying (planned, not done yet)

1. `schema.prisma` provider → `postgresql`, `DATABASE_URL` → Render/Neon Postgres; consider switching from `db push` to `prisma migrate`.
2. Render: build `npm install && npm run build -w server && npx prisma db push --schema server/prisma/schema.prisma`, start `npm start -w server`; env `NODE_ENV=production` (enables `SameSite=None; Secure` cookies + trust proxy), `JWT_SECRET`, `DATABASE_URL`, `GEMINI_API_KEY`, `CLIENT_ORIGIN=https://<vercel-domain>`.
3. Vercel: root `client`, `VITE_API_URL=https://<render-domain>`, SPA rewrite `/(.*) → /index.html`.

## Ideas / backlog

Progress photos, body measurements, offline logging queue, plate calculator, supersets, data export (CSV), barcode scanning, adaptive TDEE from weight trend + intake.

## Changelog

- **2026-10-27** — Initial build: monorepo, auth, exercise library, workout logger (previous values, rest timer, warm-ups, routines), workout/exercise detail with PRs, cardio, body weight trend + goals, food log + Gemini scan, dashboard, progress analytics, settings/units, PWA, demo seed.
- **2026-10-27** — AI: switched default to `gemini-3.1-flash-lite` with fallback, timeouts, and quota refunds (scans went from 45 s+ to ~3 s).
- **2026-10-27** — Onboarding wizard (`/setup`): sex, DOB, height, weight, activity, goal + pace + optional target weight → computed calorie/macro targets, initial weigh-in and weight goal. Calorie-burn estimates for cardio (HR/ACSM/MET) and strength (MET), shown on dashboard, workout detail, logger summary and progress. New `incline` cardio type with incline % and speed fields (also for walk/run), presets (12-3-30 etc.).
- **2026-10-27** — Git repository initialised (initial commit of the full app).
- **2026-10-27** — Phase 1 (edit saved items): edit workouts, food, cardio, routines (create/reorder), goals, and custom exercises (edit/delete). Verified in the browser and merged into `main`. Also fixed a 404 refetch after deleting a workout or custom exercise (`meta.removes` in the global mutation handler).
- **2026-10-27** — Phase 3 (automated tests): Vitest (client + server), supertest API suites incl. cross-user isolation, Playwright E2E in system Chrome. Refactors: `annotateWorkouts`, `lib/trend.ts`, `formatPace` (fixed 4:60 rounding), `assertExercisesVisible` in lib (now also guards lift goals). Root package is `"type": "module"`.
- **2026-10-27** — Phase 2 (publish-ready security): helmet, rate limits, DB-backed AI quota, tokenVersion sessions, forgot/reset password (Resend), change password, log out everywhere, data export, account deletion, Settings → Account & security card, `/forgot` + `/reset` pages. Split `app.ts` from `index.ts`. Cookie is now `SameSite=Lax` (prod will use a same-site Vercel rewrite). Fixed auth guards unmounting pages on `/me` refetch.
