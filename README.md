# Gymawy

Mobile-first fitness tracker: strength training, cardio (including incline treadmill walks), body weight, goals, personalised calorie and macro targets, calorie-burn estimates, and AI food logging from photos, nutrition labels and screenshots. Installable as a PWA.

See [CLAUDE.md](CLAUDE.md) for the full technical reference.

- **client/**: React 19, Vite, Tailwind v4, TanStack Query, Recharts, Motion
- **server/**: Node, Express 5, Prisma (SQLite locally, Postgres in production), Zod, Google Gemini

## Run it locally

Requires Node.js 22+ (LTS from https://nodejs.org).

```bash
npm install
npm run setup      # creates the SQLite database and seeds the exercise library + demo account
npm run dev        # API on :4000, app on http://localhost:5173
```

Log in with **demo@gymawy.app / demo1234** to see 12 weeks of sample data, or create your own account.

`npm run setup` rebuilds the demo account each time, but leaves other accounts alone.

### Turn on AI food scanning (free)

1. Get a free API key at https://aistudio.google.com/apikey
2. Put it in `server/.env`: `GEMINI_API_KEY="..."`
3. Restart `npm run dev`

The model defaults to `gemini-3.1-flash-lite` (answers in ~3 s on the free tier); override with `GEMINI_MODEL`. `AI_DAILY_LIMIT` caps scans per user per day (default 40).

The AI never saves anything on its own. It fills in a draft (foods, portions, calories, protein/carbs/fat) that you review and edit before logging.

## How things work

- **Units**: weights are stored in kg and distances in km; the app converts to each user's chosen units (Settings).
- **Days** are stored as `YYYY-MM-DD` strings from the user's local calendar, so charts never shift with server timezones.
- **PRs**: a set is a PR when its estimated 1RM (Epley) beats every earlier set of that exercise. The first session only sets the baseline.
- **Body weight trend**: 7-day trailing average of weigh-ins, shown next to the raw daily points.
- **Active workout** lives in `localStorage` until you hit Finish, so a refresh or a locked phone never loses sets.

## Project layout

```
server/prisma/schema.prisma   data model
server/prisma/seed.ts         exercise library + demo data
server/src/routes/            auth, training, tracking (cardio/body/goals/food), stats, ai
client/src/pages/             Today, Train, WorkoutLogger, WorkoutDetail, ExerciseDetail, Food, Body, Progress, Settings
client/src/components/        UI kit, charts (rings, heatmap), layout, exercise picker
```

## Deploying later (Vercel + Render)

1. In `server/prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"` and point `DATABASE_URL` at a Postgres database (Render or Neon).
2. **Render** (server): build `npm install && npm run build -w server && npx prisma db push --schema server/prisma/schema.prisma`, start `npm start -w server`. Set `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL`, `GEMINI_API_KEY`, and `CLIENT_ORIGIN=https://<your-vercel-domain>`.
3. **Vercel** (client): root `client`, set `VITE_API_URL=https://<your-render-domain>`, and add a rewrite of all paths to `/index.html` for client-side routing.
