# Gymawy

Mobile-first fitness tracker (installable PWA): strength workouts, cardio (incl. incline treadmill), body weight + goals, calorie/macro targets from a setup wizard, calorie-burn estimates, and AI food logging from photos/labels/screenshots via Google Gemini (free tier).

The owner uses it alone for now and plans to **publish it publicly later** (Vercel for the client + Render for the API), so keep auth, per-user data isolation and rate limits correct.

## ⚠️ Keep this file current

**After every change to the app, update this file in the same task**: new/renamed files, routes, models, env vars, commands, conventions, decisions, and the changelog at the bottom. If something here is wrong, fix it here too. This is the single source of truth for future sessions.

## 🚧 Work in progress (read this first when resuming)

The approved roadmap is in **[PLAN.md](PLAN.md)**, 4 phases, each shipped as its own commit on its own branch:
1. ~~Edit saved items~~ ✅ done, merged into `main`
2. **Publish-ready security** ← *next; start on a new branch `phase-2-security`* (rate limits, DB-backed AI quota, tokenVersion sessions, password reset via Resend, change password, export, delete account)
3. Automated tests (Vitest unit + supertest API incl. cross-user isolation + Playwright E2E with system Chrome)
4. Deploy: **Supabase** Postgres (pooled `DATABASE_URL` + `DIRECT_URL`, switch to `prisma migrate`), Render API, Vercel client with an `/api` rewrite (first-party cookies for Safari)

**Phase 1 (done 2026-10-27, verified in the browser with flow3 and no console errors; flow and flow2 still pass):**
- **Server:** `PUT /workouts/:id`, `PUT /routines/:id`, `PATCH /cardio|food|goals/:id`, `PATCH`+`DELETE /exercises/:id` (custom only; 409 if used in a workout).
- **Client:**
  - workout edit mode (`workoutStore.startEdit`, Edit button on WorkoutDetail, logger shows an "Editing" badge, a date picker, and saves with PUT)
  - food `EditFoodSheet` (tap an entry)
  - `CardioSheet` `initial` prop (tap a session)
  - `components/RoutineEditor.tsx` ("New routine" + pencil on cards)
  - `CustomExerciseSheet` on ExerciseDetail
  - `GoalSheet` `initial` prop (pencil on goal cards)

**Next step:** Phase 2 per PLAN.md, on branch `phase-2-security`.

`tests/e2e-drafts/` holds the scripts used for browser checks so far (flow = core logging, flow2 = onboarding + incline, flow3 = Phase 1 edits + deletes, shots = screenshots). They use `playwright-core` with `/Applications/Google Chrome.app`. That package isn't a project dependency: install it outside the repo, copy the script next to it, and run it with `npm run seed -w server` + `npm run dev` going: `node flow3.mjs <outDir>`. Reseed before each run, since the flows change demo data. Phase 3 replaces these with `@playwright/test`.

## Commands (run from repo root)

```bash
npm install            # npm workspaces: server + client
npm run setup          # prisma db push + seed (library + demo account)
npm run dev            # API :4000 + Vite :5173 (proxy /api → :4000)
npm run build          # server tsc + client tsc/vite build
npm run seed -w server # rebuild demo account only (other accounts untouched)
npm run db:push -w server   # apply schema.prisma changes (SQLite, no migrations yet)
npx tsc -p client --noEmit  # client typecheck
npm run typecheck -w server # server typecheck
```

Demo login: **demo@gymawy.app / demo1234** (12 weeks of data, already onboarded).

Environment notes: Node.js v24 is installed at `/usr/local/bin/node` (official installer; no Homebrew, no GitHub CLI). Google Chrome is installed; UI was verified by driving it headlessly with `playwright-core` from the session scratchpad (not a project dependency).

Git: repo initialised on `main`. Commit messages end with the Claude co-author line. `.env`, `*.db`, `dist`, `.claude/settings.local.json` and `*.tsbuildinfo` are ignored — never commit secrets.

npm in this repo uses `allowScripts` (root package.json) — only prisma, @prisma/*, esbuild, fsevents may run install scripts. New packages with install scripts must be approved with `npm install-scripts approve <pkg>`.

## Stack

- **client/**: React 19, Vite 8, TypeScript 7, Tailwind v4 (`@tailwindcss/vite`, tokens in `src/index.css` `@theme`), React Router 8 (`react-router`), TanStack Query 5, Recharts 3, Motion 14 (`motion/react`), lucide-react 1.x (icon names differ from older versions, e.g. `Trash` not `Trash2`), vite-plugin-pwa.
- **server/**: Node 24, Express 5 (async errors auto-forwarded), Prisma 6 (SQLite locally → Postgres in prod), Zod 4, bcryptjs, jsonwebtoken (httpOnly cookie `gymawy_token`, 30d), multer 2 (memory uploads), `@google/genai`.
- ESM everywhere. Server imports use `.js` extensions (nodenext).

## Layout

```
server/
  prisma/schema.prisma     data model (see below)
  prisma/seed.ts           69-exercise library + demo account (deterministic PRNG)
  src/index.ts             app wiring: /api/auth, /api/stats, /api/ai, /api (training+tracking)
  src/lib/core.ts          prisma client, HttpError, errorHandler, auth cookie + requireAuth, zDay, date math, e1rm
  src/lib/training.ts      loadTraining(): all workouts annotated with e1RM, PR flags, volume, calories
  src/routes/auth.ts       register/login/logout, GET/PATCH /me (+ latestWeightKg)
  src/routes/training.ts   exercises (+history, /last), workouts CRUD, routines
  src/routes/tracking.ts   cardio, body weight (PUT /body/:date upsert), goals (progress computed), food (+summary, recent)
  src/routes/stats.ts      /stats/dashboard, /stats/progress?range=30|90|365|all
  src/routes/ai.ts         /ai/status, /ai/analyze-food (image and/or text hint → JSON draft)
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
  pages/                   Auth, Onboarding (/setup), Today, Train (strength/cardio/exercises tabs, CARDIO_META),
                           WorkoutLogger (/train/log), WorkoutDetail, ExerciseDetail, Food (scan + manual sheets),
                           Body (weigh-in, trend, goals), Progress, Settings
```

## Data model (Prisma)

- **User**: credentials, units (`weightUnit` kg|lb, `distanceUnit` km|mi), targets (calorie/protein/carbs/fat/weeklyWorkout), profile (`sex`, `birthDate`, `heightCm`, `activityLevel`, `goal` lose|maintain|gain, `goalRateKg`), `onboarded`.
- **Exercise** (`userId` null = built-in library), **Workout** → **WorkoutExercise** → **WorkoutSet** (`weightKg`, `reps`, `rpe`, `isWarmup`); Workout has `calories`.
- **Routine** → **RoutineExercise** (targetSets/targetReps).
- **CardioSession**: `type` run|walk|incline|cycle|row|swim|elliptical|stairs|hiit|other, `durationMin`, `distanceKm`, `calories`, `avgHeartRate`, `inclinePct`, `speedKmh`.
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
- New accounts are forced through `/setup` until `onboarded` is true; Settings → "Recalculate targets" reopens it.
- Empty states and a "Get set up" checklist exist so new accounts never look blank; demo data comes from the seed.
- Chart margins: don't use negative `left` margins (they clip y-axis labels).

## Environment (server/.env, see .env.example)

`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN` (comma-separated, for CORS with credentials), `GEMINI_API_KEY` (free: aistudio.google.com/apikey), `GEMINI_MODEL`, `AI_DAILY_LIMIT`. Client: `VITE_API_URL` (only in production; dev uses the Vite proxy). Never commit `.env`.

## Deploying (planned, not done yet)

1. `schema.prisma` provider → `postgresql`, `DATABASE_URL` → Render/Neon Postgres; consider switching from `db push` to `prisma migrate`.
2. Render: build `npm install && npm run build -w server && npx prisma db push --schema server/prisma/schema.prisma`, start `npm start -w server`; env `NODE_ENV=production` (enables `SameSite=None; Secure` cookies + trust proxy), `JWT_SECRET`, `DATABASE_URL`, `GEMINI_API_KEY`, `CLIENT_ORIGIN=https://<vercel-domain>`.
3. Vercel: root `client`, `VITE_API_URL=https://<render-domain>`, SPA rewrite `/(.*) → /index.html`.
4. Before going public: move the in-memory AI quota to the DB, add rate limiting on auth, password reset, account deletion/export.

## Ideas / backlog

Progress photos, body measurements, offline logging queue, plate calculator, supersets, data export (CSV), barcode scanning, adaptive TDEE from weight trend + intake.

## Changelog

- **2026-10-27** — Initial build: monorepo, auth, exercise library, workout logger (previous values, rest timer, warm-ups, routines), workout/exercise detail with PRs, cardio, body weight trend + goals, food log + Gemini scan, dashboard, progress analytics, settings/units, PWA, demo seed.
- **2026-10-27** — AI: switched default to `gemini-3.1-flash-lite` with fallback, timeouts, and quota refunds (scans went from 45 s+ to ~3 s).
- **2026-10-27** — Onboarding wizard (`/setup`): sex, DOB, height, weight, activity, goal + pace + optional target weight → computed calorie/macro targets, initial weigh-in and weight goal. Calorie-burn estimates for cardio (HR/ACSM/MET) and strength (MET), shown on dashboard, workout detail, logger summary and progress. New `incline` cardio type with incline % and speed fields (also for walk/run), presets (12-3-30 etc.).
- **2026-10-27** — Git repository initialised (initial commit of the full app).
- **2026-10-27** — Phase 1 (edit saved items): edit workouts, food, cardio, routines (create/reorder), goals, and custom exercises (edit/delete). Verified in the browser and merged into `main`. Also fixed a 404 refetch after deleting a workout or custom exercise (`meta.removes` in the global mutation handler).
