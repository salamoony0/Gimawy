# Gymawy: editing, publish-ready security, tests, deploy

> **Status (2026-10-27): implemented and merged into `main`.** Only the owner's account setup remains (Phase 4 manual steps; see CLAUDE.md → Status). Deviations from this plan:
> - Tests and local dev run on a local **embedded Postgres** (`scripts/postgres.mjs`), not a `gymawy_test` schema on Supabase. Prisma refuses `migrate reset` from AI agents without explicit consent, and a local cluster needs no network or credentials. `TEST_DATABASE_URL` can still point the API tests at an empty external database.
> - The cookie moved to `SameSite=Lax` in Phase 2 (together with the session work), not Phase 4.
> - `GET /auth/demo` was added so the login page only offers the demo account where it's seeded.

## Context
Gymawy works locally but isn't ready to publish:
1. Saved items can only be **deleted**, not edited.
2. Security gaps: no rate limiting on login, the AI scan limit is in memory (resets on restart), no password reset, change password, account deletion or export.
3. **No automated tests.** That's risky before strangers' data is involved; checking that one user can never see another user's data matters most.
4. Not deployed. The owner chose **Supabase Postgres** (database), **Resend** (reset emails), **Render** (API), **Vercel** (client).

Build in this order, each phase shipped as its own commit, with **CLAUDE.md updated in every phase** (standing rule).

---

## Phase 1: Edit saved items

**Server** (`server/src/routes/training.ts`, `tracking.ts`). Every update checks ownership with `findFirst({ where: { id, userId } })` → 404, the same pattern as the existing deletes.
- `PUT /workouts/:id`: reuse `workoutInput` + `nestedExercises()`; in a `prisma.$transaction`, delete the workout's `WorkoutExercise` rows, then update the workout with nested create.
- `PUT /routines/:id`: reuse `routineInput`; replace the exercises in a transaction.
- `PATCH /cardio/:id`: `cardioInput.partial()`. `PATCH /food/:id`: `foodItem.partial()` + `meal` + `date`. `PATCH /goals/:id`: title / targetValue / deadline.
- `PATCH /exercises/:id` and `DELETE /exercises/:id`: custom exercises only (`userId` match). Delete returns **409** if the exercise is used in any workout (it would cascade and wipe history); the UI suggests renaming instead.
- Reuse `assertExercisesVisible()` on workout and routine updates.

**Client**
- **Workouts:** extend `lib/activeWorkout.ts` with `editingId?` and `workoutStore.startEdit(detail)`. It converts a `WorkoutDetail` into a draft (all sets `done: true`, weights converted to display units with `useUnits().weight`). `WorkoutLogger` in edit mode shows an "Editing" badge and a date field, sends `PUT` instead of `POST` on finish, and hides the rest timer and "Save as routine". Add an Edit button on `pages/WorkoutDetail.tsx`. If a different workout is in progress, confirm before replacing it.
- **Food:** tapping an entry in `pages/Food.tsx` opens an edit sheet that reuses `ItemEditor`, plus a meal `Segmented`.
- **Cardio:** `CardioSheet` (in `pages/Train.tsx`) takes `initial?: CardioSession` to prefill (display-unit conversion) and saves with PATCH. Tapping a session opens it.
- **Routines:** new `RoutineEditor` sheet (name, add via `ExercisePicker` multi, remove, move up/down, sets/reps). It opens from routine cards plus a new "New routine" button.
- **Custom exercises:** Edit and Delete on `pages/ExerciseDetail.tsx` when `isCustom`.
- **Goals:** `GoalSheet` in `pages/Body.tsx` takes `initial?: Goal`.

---

## Phase 2: Publish-ready security

- **Schema** (`server/prisma/schema.prisma`):
  - `User.tokenVersion Int @default(0)`
  - `AiUsage { userId, day, count, @@unique([userId, day]) }`
  - `PasswordResetToken { id, userId, tokenHash, expiresAt, usedAt? }`
- **Rate limiting:** add `express-rate-limit`:
  - login/register/forgot: 10 per 15 min per IP + email
  - `/api`: 300/min per user
  - `/ai`: 10/min
  - Add `helmet` for security headers.
- **AI quota in DB** (`routes/ai.ts`): replace the in-memory `usage` Map in `checkQuota`/`refundQuota` with an `AiUsage` upsert increment/decrement.
- **Session invalidation** (`lib/core.ts`): put `tokenVersion` in the JWT. `requireAuth` reads the user and rejects stale versions. Bump the version on password change/reset and on "log out everywhere".
- **Password flows** (`routes/auth.ts` + new `lib/mailer.ts`):
  - `POST /auth/forgot` always returns 200. It stores a SHA-256 hash of a random 32-byte token, valid 1 hour, and emails `${APP_URL}/reset?token=…` via the Resend REST API (`fetch`, no SDK). Without `RESEND_API_KEY`, it logs the link to the console (dev).
  - `POST /auth/reset { token, password }`.
  - `PATCH /auth/password { current, next }`.
- **Account:**
  - `GET /auth/export` returns all of the user's data as a JSON download.
  - `DELETE /auth/me { password }` removes everything (existing `onDelete: Cascade` relations) and clears the cookie.
- **Client:**
  - new pages `/forgot` and `/reset`, and a "Forgot password?" link on `pages/Auth.tsx`
  - Settings → Security card: change password, log out everywhere, export data, delete account (type-to-confirm `Sheet`)
- **New env:** `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`.

---

## Phase 3: Automated tests

- **Tool:** Vitest in both workspaces. Root `npm test` runs everything.
- **Refactor for testability:** pull the pure annotation logic out of `loadTraining()` (`server/src/lib/training.ts`) into `annotateWorkouts(rows)`, and `withTrend` out of `routes/stats.ts` into `lib/`.
- **Unit tests:**
  - `client/src/lib/energy.ts`, with known answers from manual checks:
    - male, 28 y, 178 cm, 85 kg, moderate, −0.5 kg/wk → BMR 1828 / TDEE 2833 / target 2280
    - 12-3-30 at 85 kg → 367 kcal
    - the 1500/1200 floors
    - Keytel heart-rate branch
    - MET fallback
  - `lib/format.ts`: `shiftDay`, `relativeDay`, pace
  - server `e1rm`, `weekStart`, `annotateWorkouts` PR rules (first session = baseline, warm-ups ignored), `withTrend`
- **API integration tests:** `supertest` against the Express app, exported from a new `server/src/app.ts` (`index.ts` only calls `listen`). They run against Supabase with `?schema=gymawy_test`, reset by `prisma migrate reset --force` in global setup. Cases:
  - auth (register/login/me/logout, rate limit)
  - **cross-user isolation**: user B gets 404 on A's workout, food, cardio, goal and routine for GET/PUT/PATCH/DELETE
  - workout PUT replaces sets
  - AI quota counter (Gemini mocked)
  - password reset happy path and expired token
- **E2E tests:** `@playwright/test` with `channel: 'chrome'` (system Chrome, no browser download). `webServer` runs `npm run dev`. Port the flows already proven in the scratchpad (`flow.mjs`, `flow2.mjs`): demo login → log workout → PR; register → setup → plan → dashboard goal; incline cardio estimate; food manual add. Add edit flows (edit workout set, edit food entry).

---

## Phase 4: Deploy (Supabase + Render + Vercel)

- **Prisma → Supabase:**
  - `provider = "postgresql"`, `url = env("DATABASE_URL")` (pooled, port 6543, `?pgbouncer=true`), `directUrl = env("DIRECT_URL")` (port 5432)
  - Switch from `db push` to **migrations**: `prisma migrate dev --name init`, committed
  - Dev uses the same Supabase project (or a second free project); tests use `schema=gymawy_test`
- **Seed split:** `seed:library` (idempotent, runs on every deploy) and `seed:demo` (dev only, behind `SEED_DEMO=1`).
- **Cookies:** use a **Vercel rewrite** `/api/(.*) → https://<render-app>.onrender.com/api/$1` so the browser sees one site. Without it, Safari/iOS blocks cross-site cookies and login breaks on iPhone. Then set the cookie to `SameSite=Lax; Secure` in production (`lib/core.ts`). CORS and `VITE_API_URL` aren't needed in production.
- **Files:**
  - `client/vercel.json`: rewrites for `/api` and the SPA fallback to `/index.html`
  - `render.yaml`: web service, build `npm ci && npm run build -w server && npx prisma migrate deploy --schema server/prisma/schema.prisma && npm run seed:library -w server`, start `npm start -w server`, health check `/api/health`
- **Production env (Render):** `NODE_ENV`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (new random), `GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`.
- **Owner's manual steps:**
  - push to GitHub (prerequisite)
  - create the Supabase project and copy both connection strings
  - connect the repo in Render (Blueprint) and Vercel (root `client`)
  - get a Resend key
- **Free-tier caveats to note in CLAUDE.md:** Render free sleeps after 15 min (first request ~30–50 s); Supabase free pauses after 7 days of no activity.

---

## Verification
- After each phase, run the typechecks (`npx tsc -p client --noEmit`, `npm run typecheck -w server`), `npm test`, and `npm run build`.
- **Phase 1:** E2E edit flows. Also check by hand that editing a workout's set to a heavier weight moves the PR flag and the dashboard numbers.
- **Phase 2:** the integration tests above. With no Resend key the reset link appears in the server log; with a key, a real email arrives. The 11th rapid login attempt returns 429.
- **Phase 4:** on the live Vercel URL, on desktop **and on an iPhone in Safari**:
  - register → setup → log a workout → scan a meal → reload (session survives)
  - password reset email arrives
  - `/api/health` reports ok through the Vercel rewrite
