const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = void,>(path: string) => request<T>('DELETE', path),
};

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

export type Routine = {
  id: string;
  name: string;
  exercises: { exerciseId: string; name: string; muscleGroup: string; targetSets: number; targetReps: number }[];
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
export type FoodSource = 'manual' | 'label' | 'screenshot' | 'photo' | 'text';

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
  source: Exclude<FoodSource, 'manual'>;
  confidence: 'high' | 'medium' | 'low';
  mealName: string;
  notes: string;
  items: (FoodItem & { quantity: string })[];
};

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
