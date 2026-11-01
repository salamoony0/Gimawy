import { isNetworkError, outbox, type Outgoing } from './offline';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** crypto.randomUUID needs a secure context; a phone on the dev server's LAN address isn't one. */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

/** What `api.offline()` returns when the write was queued on the device instead of sent. */
export type Queued = { queued: true };
export const isQueued = (r: unknown): r is Queued => typeof r === 'object' && r !== null && (r as Queued).queued === true;

export const api = {
  /**
   * A logging write that may happen without signal (at the gym): sent now if possible, otherwise queued in the
   * offline outbox and replayed later by `syncOutbox()`. HTTP errors (validation etc.) are thrown as usual.
   * A POST carries an Idempotency-Key, kept for the replays: if the first attempt did reach the server and only
   * the answer was lost, the replay gets that answer back instead of logging the entry twice.
   */
  offline: async <T,>(method: Outgoing['method'], path: string, body: unknown, label: string): Promise<T | Queued> => {
    const key = method === 'POST' ? newKey() : undefined;
    try {
      return await request<T>(method, path, body, key);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      outbox.add({ method, path, body, label, key });
      return { queued: true };
    }
  },
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = void,>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** Saves a file the API sends as an attachment (uses the filename from Content-Disposition). */
  download: async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  },
};

export type SyncResult = { sent: number; failed: { label: string; message: string }[] };
let syncing: Promise<SyncResult> | null = null;

/**
 * Replays the signed-in account's queued writes in order. Stops at the first one that can't be delivered yet
 * (still offline, signed out, rate limited, still being saved, server error) and keeps it for next time; one the server rejects
 * outright (4xx) is dropped and reported, so a bad entry can't block the rest forever.
 */
export function syncOutbox(): Promise<SyncResult> {
  syncing ??= (async () => {
    const result: SyncResult = { sent: 0, failed: [] };
    for (const item of outbox.mine()) {
      try {
        await request(item.method, item.path, item.body, item.key);
        outbox.remove(item.id);
        result.sent++;
      } catch (e) {
        // 409: the first attempt is still being saved; the next sync gets its answer.
        const retryLater = [401, 408, 409, 429];
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && !retryLater.includes(e.status)) {
          outbox.remove(item.id);
          result.failed.push({ label: item.label, message: e.message });
          continue;
        }
        break;
      }
    }
    return result;
  })().finally(() => (syncing = null));
  return syncing;
}

// ---------- types (mirror the server responses) ----------

export type User = {
  id: string;
  email: string;
  name: string;
  weightUnit: 'kg' | 'lb';
  distanceUnit: 'km' | 'mi';
  heightCm: number | null;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  weeklyWorkoutTarget: number;
  sex: 'male' | 'female' | null;
  birthDate: string | null;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  goal: 'lose' | 'maintain' | 'gain' | null;
  goalRateKg: number | null;
  onboarded: boolean;
  /** Re-fit the calorie target to the observed TDEE once a week (see lib/energy.ts adaptiveTargets). */
  autoAdjustTargets: boolean;
  targetsAdjustedAt: string | null;
  latestWeightKg: number | null;
  createdAt: string;
};

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  isCustom: boolean;
  timesPerformed: number;
};

export type SetRow = {
  id: string;
  order: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
  e1rm: number;
  isPr: boolean;
};

export type WorkoutSummary = {
  id: string;
  name: string;
  date: string;
  durationMin: number | null;
  calories: number | null;
  volume: number;
  setCount: number;
  prCount: number;
  muscles: string[];
  exercises: { name: string; sets: number; best: SetRow | null }[];
};

export type WorkoutDetail = {
  id: string;
  name: string;
  date: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  durationMin: number | null;
  calories: number | null;
  volume: number;
  setCount: number;
  prCount: number;
  exercises: {
    id: string;
    exerciseId: string;
    name: string;
    muscleGroup: string;
    equipment: string;
    supersetGroup: number | null;
    volume: number;
    bestE1rm: number;
    sets: SetRow[];
    previous: { date: string; volume: number; bestE1rm: number } | null;
  }[];
};

export type ExerciseHistory = {
  exercise: Exercise & { userId: string | null };
  sessions: {
    workoutId: string;
    workoutName: string;
    date: string;
    e1rm: number;
    topWeightKg: number;
    volume: number;
    totalReps: number;
    isPr: boolean;
    sets: SetRow[];
  }[];
  records: {
    bestE1rm: (SetRow & { date: string }) | null;
    heaviest: (SetRow & { date: string }) | null;
    mostReps: (SetRow & { date: string }) | null;
    bestVolume: { date: string; volume: number } | null;
  };
};

/** A best set: from a workout (`workoutId`) or entered by hand on the Records tab (`recordId`). */
export type RecordSet = {
  date: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  source: 'workout' | 'manual';
  workoutId?: string;
  recordId?: string;
};

/** GET /records: one row per visible exercise. */
export type RecordRow = {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  isCustom: boolean;
  current: RecordSet | null;
  previous: RecordSet | null;
  manual: { id: string; date: string; weightKg: number; reps: number }[];
};

export type Routine = {
  id: string;
  name: string;
  exercises: { exerciseId: string; name: string; muscleGroup: string; targetSets: number; targetReps: number; supersetGroup: number | null }[];
};

export type CardioType = 'run' | 'walk' | 'incline' | 'cycle' | 'row' | 'swim' | 'elliptical' | 'stairs' | 'hiit' | 'other';

export type CardioSession = {
  id: string;
  type: CardioType;
  date: string;
  durationMin: number;
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  inclinePct: number | null;
  speedKmh: number | null;
  notes: string | null;
};

export type BodyWeight = { id: string; date: string; weightKg: number; bodyFatPct: number | null };

export type Goal = {
  id: string;
  type: 'weight' | 'lift' | 'cardio';
  title: string;
  exerciseId: string | null;
  exerciseName: string | null;
  targetValue: number;
  startValue: number;
  current: number | null;
  deadline: string | null;
  progress: number;
};

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'manual' | 'label' | 'screenshot' | 'photo' | 'text' | 'barcode' | 'search' | 'custom' | 'meal';

export type FoodItem = {
  name: string;
  quantity: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodEntry = FoodItem & { id: string; date: string; meal: Meal; source: FoodSource };

export type FoodAnalysis = {
  source: Exclude<FoodSource, 'manual' | 'barcode' | 'search' | 'custom' | 'meal'>;
  confidence: 'high' | 'medium' | 'low';
  mealName: string;
  notes: string;
  items: (FoodItem & { quantity: string })[];
};

export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  per100g: { calories: number; protein: number; carbs: number; fat: number } | null;
  serving: { label: string; grams: number } | null;
};

/** A built-in food (GET /food/search): nutrition is for `serving`, which weighs `grams` when known. */
export type DbFood = {
  id: string;
  name: string;
  nameAr: string | null;
  brand: string | null;
  kind: 'generic' | 'egyptian' | 'restaurant' | 'brand';
  source: 'usda' | 'estimate' | 'published' | 'off';
  serving: string;
  grams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: { label: string; grams: number }[] | null;
};

/** A food the user created (My foods): nutrition for one `serving`, weighing `grams` when known. */
export type CustomFood = {
  id: string;
  name: string;
  serving: string;
  grams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** A named group of foods logged together (My meals). */
export type SavedMeal = { id: string; name: string; items: FoodItem[] };

/** GET /food/search — my meals, my foods, my past entries, then the built-in database. */
export type FoodSearch = { meals: SavedMeal[]; custom: CustomFood[]; mine: FoodItem[]; foods: DbFood[] };

/** GET /food/search/products — packaged products from Open Food Facts. */
export type ProductSearch = { products: BarcodeProduct[] };

/** GET /food/barcode/:code — `mine` is the user's own last entry for that code (takes priority). */
export type BarcodeLookup = { code: string; product: BarcodeProduct | null; mine: FoodItem | null };

export type TrendPoint = { date: string; weightKg: number; trendKg: number };

export type PR = {
  date: string;
  workoutId: string;
  exerciseId: string;
  exercise: string;
  weightKg: number;
  reps: number;
  e1rm: number;
};

export type Dashboard = {
  today: string;
  user: { name: string };
  targets: { calories: number; protein: number; carbs: number; fat: number; weeklyWorkouts: number };
  nutrition: { calories: number; protein: number; carbs: number; fat: number; items: number };
  week: { workouts: number; cardioMinutes: number; volume: number; lastWeekVolume: number; caloriesBurned: number };
  burnedToday: number;
  streak: number;
  heatmap: { date: string; strength: number; cardio: number; volume: number; minutes: number; level: number; future: boolean }[];
  weeklyVolume: { week: string; volume: number; sets: number; sessions: number }[];
  calories7: { date: string; calories: number; protein: number }[];
  weight: { latest: BodyWeight | null; change30: number | null; entries: TrendPoint[]; count: number };
  recentWorkouts: WorkoutSummary[];
  recentPrs: PR[];
  totals: { workouts: number; cardio: number };
};

export type Progress = {
  from: string;
  to: string;
  totals: {
    workouts: number;
    volume: number;
    sets: number;
    hours: number;
    prs: number;
    cardioSessions: number;
    cardioMinutes: number;
    distanceKm: number;
    caloriesBurned: number;
  };
  weekly: { week: string; volume: number; sets: number; workouts: number; cardioMinutes: number; distanceKm: number }[];
  muscleSplit: { muscle: string; sets: number }[];
  topLifts: { exerciseId: string; name: string; sessions: number; points: { date: string; e1rm: number }[]; best: number; change: number }[];
  cardioByType: { type: CardioType; minutes: number; sessions: number; distanceKm: number }[];
  weekdays: { day: string; strength: number; cardio: number }[];
  nutrition: {
    daysLogged: number;
    avgCalories: number;
    avgProtein: number;
    calorieAdherence: number;
    proteinAdherence: number;
    targetCalories: number;
    targetProtein: number;
  };
  weight: { entries: TrendPoint[]; change: number | null };
  prs: PR[];
};
