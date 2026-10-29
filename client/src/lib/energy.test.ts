import { describe, expect, it } from 'vitest';
import { adaptiveTargets, ageFrom, bmr, estimateCardio, estimateStrength, planTargets } from './energy';

const male = { sex: 'male' as const, weightKg: 85, heightCm: 178, age: 28 };

describe('planTargets', () => {
  it('matches the hand-checked cutting plan', () => {
    const plan = planTargets({ ...male, activity: 'moderate', goal: 'lose', rateKgPerWeek: 0.5 });
    expect(plan).toMatchObject({ bmr: 1828, tdee: 2833, adjustment: -550, calories: 2280, floorApplied: false });
    expect(plan.protein).toBe(187); // 2.2 g/kg when cutting
    expect(plan.fat).toBe(Math.round((2280 * 0.25) / 9));
    expect(plan.protein * 4 + plan.carbs * 4 + plan.fat * 9).toBeCloseTo(2280, -1);
  });

  it('uses 1.8 g/kg protein outside a cut and caps it at 260 g', () => {
    expect(planTargets({ ...male, activity: 'moderate', goal: 'gain', rateKgPerWeek: 0.25 }).protein).toBe(153);
    expect(planTargets({ ...male, weightKg: 160, activity: 'moderate', goal: 'lose', rateKgPerWeek: 0.5 }).protein).toBe(260);
  });

  it('never goes below 1500 kcal for men and 1200 kcal for women', () => {
    const small = { weightKg: 45, heightCm: 150, age: 60, activity: 'sedentary' as const, goal: 'lose' as const, rateKgPerWeek: 1 };
    expect(planTargets({ ...small, sex: 'male' })).toMatchObject({ calories: 1500, floorApplied: true });
    expect(planTargets({ ...small, sex: 'female' })).toMatchObject({ calories: 1200, floorApplied: true });
  });

  it('applies the female Mifflin-St Jeor constant', () => {
    expect(bmr({ ...male, sex: 'female' })).toBe(bmr(male) - 166);
  });
});

describe('estimateCardio', () => {
  it('12-3-30 (12% incline, 4.8 km/h, 30 min) at 85 kg ≈ 367 kcal via ACSM walking', () => {
    expect(estimateCardio({ type: 'incline', durationMin: 30, weightKg: 85, speedKmh: 4.8, inclinePct: 12 })).toEqual({ kcal: 367, method: 'speed' });
  });

  it('prefers the Keytel heart-rate equation when HR, age and sex are known', () => {
    const r = estimateCardio({ type: 'run', durationMin: 30, weightKg: 85, speedKmh: 10, avgHeartRate: 150, age: 28, sex: 'male' });
    const perMin = (-55.0969 + 0.6309 * 150 + 0.1988 * 85 + 0.2017 * 28) / 4.184;
    expect(r).toEqual({ kcal: Math.round(perMin * 30), method: 'heart-rate' });
  });

  it('ignores heart rate without age/sex and falls back to speed', () => {
    expect(estimateCardio({ type: 'run', durationMin: 30, weightKg: 85, speedKmh: 10, avgHeartRate: 150 }).method).toBe('speed');
  });

  it('falls back to MET × 3.5 × kg × min / 200', () => {
    expect(estimateCardio({ type: 'cycle', durationMin: 60, weightKg: 80 })).toEqual({ kcal: Math.round((7.5 * 3.5 * 80 * 60) / 200), method: 'met' });
  });

  it('returns 0 for missing duration or weight', () => {
    expect(estimateCardio({ type: 'run', durationMin: 0, weightKg: 80 }).kcal).toBe(0);
    expect(estimateCardio({ type: 'run', durationMin: 30, weightKg: 0 }).kcal).toBe(0);
  });
});

describe('estimateStrength / ageFrom', () => {
  it('uses MET 5.0', () => {
    expect(estimateStrength(60, 80)).toBe(420);
    expect(estimateStrength(0, 80)).toBe(0);
  });

  it('counts birthdays correctly', () => {
    expect(ageFrom('1998-06-15', new Date(2026, 5, 14))).toBe(27);
    expect(ageFrom('1998-06-15', new Date(2026, 5, 15))).toBe(28);
  });
});

describe('adaptiveTargets', () => {
  const today = '2026-10-29';
  const day = (offset: number) => {
    const d = new Date(Date.UTC(2026, 9, 29 + offset));
    return d.toISOString().slice(0, 10);
  };
  // 28 days of 2,500 kcal while losing exactly 0.5 kg/week (90 → 88 kg).
  const intake = Array.from({ length: 28 }, (_, i) => ({ date: day(-28 + i), calories: 2500 }));
  const weighIns = Array.from({ length: 29 }, (_, i) => ({ date: day(-28 + i), weightKg: 90 - (0.5 / 7) * i }));
  const base = { today, intake, weighIns, currentTarget: 2200, sex: 'male' as const, goal: 'lose' as const, rateKgPerWeek: 0.5 };

  it('recovers maintenance from intake and the weight slope', () => {
    const r = adaptiveTargets(base);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    // 2,500 eaten + 0.5 kg/week × 7,700 ÷ 7 = 550 released from body stores → 3,050 burned.
    expect(r).toMatchObject({ avgIntake: 2500, weightChangePerWeek: -0.5, tdee: 3050, idealTarget: 2500, loggedDays: 28 });
    // Moves at most 250 kcal at a time: 2,200 → 2,450, macros from the latest weight (88 kg, cutting).
    expect(r.suggested).toEqual({ calories: 2450, protein: 194, fat: 68, carbs: 266 });
    expect(r.change).toBe(250);
  });

  it('ignores today and partially logged days', () => {
    const noisy = [...intake, { date: today, calories: 300 }, { date: day(-3), calories: 400 }];
    const r = adaptiveTargets({ ...base, intake: noisy.filter((d, i, all) => all.findIndex((x) => x.date === d.date) === i) });
    expect(r.status === 'ready' && r.avgIntake).toBe(2500);
  });

  it('keeps collecting until there are 14 logged days and 4 weigh-ins over 14+ days', () => {
    expect(adaptiveTargets({ ...base, intake: intake.slice(-13) })).toMatchObject({ status: 'collecting', loggedDays: 13 });
    expect(adaptiveTargets({ ...base, weighIns: weighIns.slice(-10) })).toMatchObject({ status: 'collecting', weighSpanDays: 9 });
    expect(adaptiveTargets({ ...base, weighIns: [weighIns[0], weighIns[28]] })).toMatchObject({ status: 'collecting', weighIns: 2 });
  });

  it('maintenance goals target the observed TDEE, and the floor still applies', () => {
    const r = adaptiveTargets({ ...base, goal: 'maintain', currentTarget: 3000 });
    expect(r.status === 'ready' && r.suggested.calories).toBe(3050);
    const low = adaptiveTargets({ ...base, intake: intake.map((d) => ({ ...d, calories: 1000 })), currentTarget: 1300, sex: 'female', goal: 'lose', rateKgPerWeek: 1 });
    expect(low.status === 'ready' && low.suggested.calories).toBe(1200);
  });
});
