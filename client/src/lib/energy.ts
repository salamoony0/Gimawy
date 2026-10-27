/**
 * Energy math for targets and calorie-burn estimates.
 *
 * - BMR: Mifflin-St Jeor.
 * - Daily burn (TDEE): BMR × activity multiplier.
 * - Goal: ±7,700 kcal per kg of body weight, spread across the week.
 * - Cardio burn, best available method:
 *     1. average heart rate → Keytel et al. (2005) equation (needs age + sex)
 *     2. walking/running speed (+ incline) → ACSM metabolic equations
 *     3. otherwise → MET value for the activity × body weight × time
 * - Strength workouts: MET for resistance training × body weight × time.
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
  const sign = input.goal === 'lose' ? -1 : input.goal === 'gain' ? 1 : 0;
  const adjustment = (sign * input.rateKgPerWeek * KCAL_PER_KG) / 7;
  // Never suggest going below a safe minimum without medical supervision.
  const floor = input.sex === 'male' ? 1500 : 1200;
  const raw = tdee + adjustment;
  const calories = Math.round(Math.max(raw, floor) / 10) * 10;

  // Protein ~2 g/kg (higher end when cutting to protect muscle), fat 25% of calories, carbs fill the rest.
  const protein = Math.round(Math.min(input.weightKg * (input.goal === 'lose' ? 2.2 : 1.8), 260));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    adjustment: Math.round(adjustment),
    calories,
    floorApplied: raw < floor,
    protein,
    carbs,
    fat,
  };
}

// ---------- burn estimates ----------

/** Compendium of Physical Activities MET values for a moderate effort. */
const CARDIO_MET: Record<CardioType, number> = {
  run: 9.8,
  walk: 3.5,
  incline: 6.0,
  cycle: 7.5,
  row: 7.0,
  swim: 7.0,
  elliptical: 5.0,
  stairs: 9.0,
  hiit: 8.0,
  other: 6.0,
};

/** Resistance training, mixed intensity (Compendium 02054/02052). */
export const STRENGTH_MET = 5.0;

export type BurnMethod = 'heart-rate' | 'speed' | 'met';

export function estimateCardio(input: {
  type: CardioType;
  durationMin: number;
  weightKg: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  avgHeartRate?: number | null;
  age?: number | null;
  sex?: Sex | null;
}): { kcal: number; method: BurnMethod } {
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

  return { kcal: Math.round((CARDIO_MET[type] * 3.5 * weightKg * durationMin) / 200), method: 'met' };
}

export function estimateStrength(durationMin: number, weightKg: number) {
  if (!(durationMin > 0) || !(weightKg > 0)) return 0;
  return Math.round((STRENGTH_MET * 3.5 * weightKg * durationMin) / 200);
}

export const BURN_METHOD_LABEL: Record<BurnMethod, string> = {
  'heart-rate': 'from your heart rate, age and weight',
  speed: 'from your speed, incline and weight',
  met: 'from activity type, time and your weight',
};

/** Body weight to use for estimates: latest weigh-in, else a neutral default. */
export function bodyWeightFor(me: User | undefined) {
  return me?.latestWeightKg ?? 75;
}

export function profileFor(me: User | undefined) {
  return {
    weightKg: bodyWeightFor(me),
    age: me?.birthDate ? ageFrom(me.birthDate) : null,
    sex: (me?.sex as Sex | null) ?? null,
  };
}
