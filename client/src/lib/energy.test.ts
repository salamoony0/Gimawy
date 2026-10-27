import { describe, expect, it } from 'vitest';
import { ageFrom, bmr, estimateCardio, estimateStrength, planTargets } from './energy';

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
