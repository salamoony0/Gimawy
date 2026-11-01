/**
 * Energy math for targets and calorie-burn estimates.
 *
 * - BMR: Mifflin-St Jeor.
 * - Daily burn (TDEE): BMR × activity multiplier.
 * - Goal: ±7,700 kcal per kg of body weight, spread across the week.
 * - Cardio burn, best available method:
 *     1. average heart rate → Keytel et al. (2005) equation (needs age + sex)
 *     2. walking/running speed (+ incline) → ACSM metabolic equations
 *     3. otherwise → MET value for the activity (2024 Adult Compendium) × resting burn × time
 * - Strength workouts: MET for resistance training × resting burn × time.
 * - Resting burn for METs: the person's own Mifflin-St Jeor BMR when sex, age and height are known ("corrected METs"),
 *   else the standard 1 MET = 3.5 ml O2/kg/min.
 * - Adaptive TDEE: average logged intake − (weight trend slope × 7,700 kcal/kg), over the last 28 days.
 *
 * docs/CALORIES.md explains every formula with worked examples; keep it in sync with this file.
 */
import type { CardioType, User } from './api';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY: Record<ActivityLevel, { label: string; body: string; factor: number }> = {
  sedentary: { label: 'Sedentary', body: 'Desk job, little or no exercise', factor: 1.2 },
  light: { label: 'Lightly active', body: 'Exercise 1–3 days a week', factor: 1.375 },
  moderate: { label: 'Moderately active', body: 'Exercise 3–5 days a week', factor: 1.55 },
  active: { label: 'Very active', body: 'Hard exercise 6–7 days a week', factor: 1.725 },
  very_active: { label: 'Athlete', body: 'Training twice a day or a physical job', factor: 1.9 },
};

export const KCAL_PER_KG = 7700;

export function ageFrom(birthDate: string, today = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export function bmr({ sex, weightKg, heightCm, age }: { sex: Sex; weightKg: number; heightCm: number; age: number }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export type Plan = {
  bmr: number;
  tdee: number;
  adjustment: number;
  calories: number;
  floorApplied: boolean;
  protein: number;
  carbs: number;
  fat: number;
};

/** Daily targets from body stats, activity and goal. */
export function planTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
  rateKgPerWeek: number;
}): Plan {
  const base = bmr(input);
  const tdee = base * ACTIVITY[input.activity].factor;
  const adjustment = goalAdjustment(input.goal, input.rateKgPerWeek);
  const raw = tdee + adjustment;
  const calories = roundTarget(raw, input.sex);

  return {
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    adjustment: Math.round(adjustment),
    calories,
    floorApplied: raw < calorieFloor(input.sex),
    ...macrosFor(calories, input.weightKg, input.goal),
  };
}

/** Never suggest going below a safe minimum without medical supervision. */
export const calorieFloor = (sex: Sex | null | undefined) => (sex === 'male' ? 1500 : 1200);

/** Daily calorie change for a goal pace: ±kg/week × 7,700 kcal/kg ÷ 7 days. */
export function goalAdjustment(goal: Goal | null | undefined, rateKgPerWeek: number | null | undefined) {
  const sign = goal === 'lose' ? -1 : goal === 'gain' ? 1 : 0;
  return (sign * (rateKgPerWeek ?? 0) * KCAL_PER_KG) / 7;
}

const roundTarget = (kcal: number, sex: Sex | null | undefined) => Math.round(Math.max(kcal, calorieFloor(sex)) / 10) * 10;

/** Protein ~2 g/kg (higher end when cutting to protect muscle), fat 25% of calories, carbs fill the rest. */
export function macrosFor(calories: number, weightKg: number, goal: Goal | null | undefined) {
  const protein = Math.round(Math.min(weightKg * (goal === 'lose' ? 2.2 : 1.8), 260));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

// ---------- adaptive TDEE ----------

/** Days of history used; long enough to average out water-weight swings, short enough to follow real changes. */
export const ADAPTIVE_WINDOW_DAYS = 28;
export const ADAPTIVE_MIN_LOGGED_DAYS = 14;
export const ADAPTIVE_MIN_WEIGH_INS = 4;
export const ADAPTIVE_MIN_WEIGH_SPAN_DAYS = 14;
/** A day under this share of the current target is treated as "forgot to log", not as eating that little. */
export const ADAPTIVE_PARTIAL_DAY = 0.4;
/** One adjustment moves the target at most this far, so a noisy month can't swing it wildly. */
export const ADAPTIVE_MAX_STEP = 250;

export type AdaptiveResult =
  | {
      status: 'collecting';
      loggedDays: number;
      weighIns: number;
      weighSpanDays: number;
    }
  | {
      status: 'ready';
      loggedDays: number;
      weighIns: number;
      weighSpanDays: number;
      avgIntake: number;
      /** Fitted weight change, kg per week (negative = losing). */
      weightChangePerWeek: number;
      /** Observed maintenance calories. */
      tdee: number;
      /** Where the data says the target should be (observed TDEE + goal adjustment, floored). */
      idealTarget: number;
      /** The next target: idealTarget, but at most ADAPTIVE_MAX_STEP away from the current one. */
      suggested: { calories: number; protein: number; carbs: number; fat: number };
      change: number;
    };

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Least-squares slope of y over x. */
function slope(points: { x: number; y: number }[]) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  return sxx ? sxy / sxx : 0;
}

/**
 * Maintenance calories from the user's own data: energy in (food log) minus the energy stored or released as body
 * weight changed. Uses the 28 days before today (today's log is usually unfinished), skips days that look
 * partially logged, and fits a straight line through the weigh-ins so single noisy readings matter little.
 */
export function adaptiveTargets(input: {
  today: string;
  intake: { date: string; calories: number }[];
  weighIns: { date: string; weightKg: number }[];
  currentTarget: number;
  sex: Sex | null;
  goal: Goal | null;
  rateKgPerWeek: number | null;
}): AdaptiveResult {
  const end = dayNumber(input.today);
  const start = end - ADAPTIVE_WINDOW_DAYS;
  const minDay = input.currentTarget * ADAPTIVE_PARTIAL_DAY;
  const days = input.intake.filter((d) => {
    const n = dayNumber(d.date);
    return n >= start && n < end && d.calories >= minDay;
  });
  // Weigh-ins may include this morning's.
  const weights = input.weighIns
    .map((w) => ({ x: dayNumber(w.date), y: w.weightKg }))
    .filter((p) => p.x >= start && p.x <= end)
    .sort((a, b) => a.x - b.x);
  const weighSpanDays = weights.length ? weights[weights.length - 1].x - weights[0].x : 0;
  const counts = { loggedDays: days.length, weighIns: weights.length, weighSpanDays };

  if (
    days.length < ADAPTIVE_MIN_LOGGED_DAYS ||
    weights.length < ADAPTIVE_MIN_WEIGH_INS ||
    weighSpanDays < ADAPTIVE_MIN_WEIGH_SPAN_DAYS
  ) {
    return { status: 'collecting', ...counts };
  }

  const avgIntake = days.reduce((a, d) => a + d.calories, 0) / days.length;
  const kgPerDay = slope(weights);
  const tdee = avgIntake - kgPerDay * KCAL_PER_KG;
  const idealTarget = roundTarget(tdee + goalAdjustment(input.goal, input.rateKgPerWeek), input.sex);
  const step = Math.max(-ADAPTIVE_MAX_STEP, Math.min(ADAPTIVE_MAX_STEP, idealTarget - input.currentTarget));
  const calories = roundTarget(input.currentTarget + step, input.sex);
  const latestKg = weights[weights.length - 1].y;

  return {
    status: 'ready',
    ...counts,
    avgIntake: Math.round(avgIntake),
    weightChangePerWeek: Math.round(kgPerDay * 7 * 100) / 100,
    tdee: Math.round(tdee),
    idealTarget,
    suggested: { calories, ...macrosFor(calories, latestKg, input.goal) },
    change: calories - input.currentTarget,
  };
}

// ---------- burn estimates ----------

/**
 * 2024 Adult Compendium of Physical Activities (Herrmann et al., J Sport Health Sci 2024), moderate effort; code in
 * the comment. Only used when there's no heart rate and (for walk/run/incline) no speed.
 */
export const CARDIO_MET: Record<CardioType, number> = {
  run: 9.3, // 12050 running 6–6.3 mph (10 min/mile)
  walk: 3.8, // 17190 walking 2.8–3.4 mph, level, moderate pace
  incline: 7.4, // no Compendium code: ACSM walking equation at 4.8 km/h, 10% grade
  cycle: 7.0, // 01014 bicycling, general
  row: 5.0, // 02071 rowing ergometer, moderate effort
  swim: 5.8, // 18240 swimming laps, freestyle, slow
  elliptical: 5.0, // 02048 elliptical trainer, moderate effort
  stairs: 9.3, // 02065 stair treadmill ergometer, general
  hiit: 7.0, // 02210 high intensity interval exercise, moderate effort
  other: 5.0, // 02035 circuit training, moderate effort
};

/** Compendium 02054: resistance (weight) training, multiple exercises, 8–15 reps at varied resistance. */
export const STRENGTH_MET = 3.5;

export type BodyProfile = { weightKg: number; heightCm?: number | null; age?: number | null; sex?: Sex | null };

/**
 * kcal per minute at rest, i.e. what 1 MET is for this person. The Compendium's standard 1 MET (3.5 ml O2/kg/min)
 * overestimates most adults' resting burn, more so with higher body mass and age, so when sex, age and height are
 * known the person's own Mifflin-St Jeor BMR is used instead ("corrected METs", pacompendium.com/corrected-mets).
 */
export function restingKcalPerMin({ weightKg, heightCm, age, sex }: BodyProfile) {
  if (sex && age && heightCm) return bmr({ sex, weightKg, heightCm, age }) / 1440;
  return (3.5 * weightKg) / 200;
}

const metKcal = (met: number, durationMin: number, profile: BodyProfile) => Math.round(met * restingKcalPerMin(profile) * durationMin);

export type BurnMethod = 'heart-rate' | 'speed' | 'met';

export function estimateCardio(input: {
  type: CardioType;
  durationMin: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  avgHeartRate?: number | null;
} & BodyProfile): { kcal: number; method: BurnMethod } {
  const { type, durationMin, weightKg } = input;
  if (!(durationMin > 0) || !(weightKg > 0)) return { kcal: 0, method: 'met' };

  if (input.avgHeartRate && input.age && input.sex) {
    const hr = input.avgHeartRate;
    const perMin =
      input.sex === 'male'
        ? (-55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * input.age) / 4.184
        : (-20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * input.age) / 4.184;
    if (perMin > 0) return { kcal: Math.round(perMin * durationMin), method: 'heart-rate' };
  }

  const onFoot = type === 'walk' || type === 'run' || type === 'incline';
  if (onFoot && input.speedKmh && input.speedKmh > 0) {
    const mPerMin = (input.speedKmh * 1000) / 60;
    const grade = (input.inclinePct ?? 0) / 100;
    // ACSM: walking is valid up to ~6.5 km/h, running from ~8 km/h; use the type in between.
    const running = input.speedKmh >= 8 || (type === 'run' && input.speedKmh > 6.5);
    const vo2 = running ? 0.2 * mPerMin + 0.9 * mPerMin * grade + 3.5 : 0.1 * mPerMin + 1.8 * mPerMin * grade + 3.5;
    // ml O2/kg/min → kcal: ~5 kcal per litre of oxygen.
    return { kcal: Math.round(((vo2 * weightKg) / 1000) * 5 * durationMin), method: 'speed' };
  }

  return { kcal: metKcal(CARDIO_MET[type], durationMin, input), method: 'met' };
}

export function estimateStrength(durationMin: number, profile: BodyProfile) {
  if (!(durationMin > 0) || !(profile.weightKg > 0)) return 0;
  return metKcal(STRENGTH_MET, durationMin, profile);
}

export const BURN_METHOD_LABEL: Record<BurnMethod, string> = {
  'heart-rate': 'from your heart rate, age and weight',
  speed: 'from your speed, incline and weight',
  met: 'from activity type, time and your body stats',
};

/** Body weight to use for estimates: latest weigh-in, else a neutral default. */
export function bodyWeightFor(me: User | undefined) {
  return me?.latestWeightKg ?? 75;
}

export function profileFor(me: User | undefined): BodyProfile {
  return {
    weightKg: bodyWeightFor(me),
    heightCm: me?.heightCm ?? null,
    age: me?.birthDate ? ageFrom(me.birthDate) : null,
    sex: (me?.sex as Sex | null) ?? null,
  };
}
