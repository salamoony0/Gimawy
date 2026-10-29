import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, e1rm, weekStart } from '../src/lib/core.js';
import { annotateWorkouts, normalizeSupersets, recordProgressions, type WorkoutRow } from '../src/lib/training.js';
import { withTrend } from '../src/lib/trend.js';

describe('date math', () => {
  it('weekStart returns the Monday of the week', () => {
    expect(weekStart('2026-10-27')).toBe('2026-10-26'); // Tuesday
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across a year
  });

  it('addDays and daysBetween are inverse', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-01', addDays('2026-10-01', 45))).toBe(45);
  });
});

describe('e1rm (Epley)', () => {
  it('is the weight itself for a single and weight × (1 + reps/30) otherwise', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2);
    expect(e1rm(100, 0)).toBe(0);
  });
});

// Minimal rows in the shape Prisma returns for loadTraining's include.
let n = 0;
function workout(date: string, exercises: Array<{ exerciseId: string; sets: Array<[number, number, boolean?]> }>): WorkoutRow {
  const id = `w${++n}`;
  return {
    id,
    userId: 'u',
    name: 'W',
    date,
    startedAt: new Date(`${date}T10:00:00Z`),
    endedAt: new Date(`${date}T11:00:00Z`),
    notes: null,
    calories: null,
    createdAt: new Date(),
    exercises: exercises.map((e, i) => ({
      id: `${id}e${i}`,
      workoutId: id,
      exerciseId: e.exerciseId,
      order: i,
      supersetGroup: null,
      exercise: { id: e.exerciseId, name: e.exerciseId, muscleGroup: 'chest', equipment: 'barbell', userId: null },
      sets: e.sets.map(([weightKg, reps, isWarmup = false], j) => ({
        id: `${id}e${i}s${j}`,
        workoutExerciseId: `${id}e${i}`,
        order: j,
        weightKg,
        reps,
        rpe: null,
        isWarmup,
      })),
    })),
  };
}

describe('annotateWorkouts', () => {
  it('never flags the first session of an exercise (baseline)', () => {
    const [first] = annotateWorkouts([workout('2026-10-01', [{ exerciseId: 'bench', sets: [[100, 5]] }])]);
    expect(first.prCount).toBe(0);
    expect(first.exercises[0].sets[0].isPr).toBe(false);
  });

  it('flags only the single best set of a later session that beats history', () => {
    const [, second] = annotateWorkouts([
      workout('2026-10-01', [{ exerciseId: 'bench', sets: [[100, 5]] }]),
      workout('2026-10-03', [{ exerciseId: 'bench', sets: [[102.5, 5], [105, 5], [100, 5]] }]),
    ]);
    expect(second.exercises[0].sets.map((s) => s.isPr)).toEqual([false, true, false]);
    expect(second.prCount).toBe(1);
  });

  it('does not flag a session that only ties or falls short', () => {
    const [, second] = annotateWorkouts([
      workout('2026-10-01', [{ exerciseId: 'bench', sets: [[100, 5]] }]),
      workout('2026-10-03', [{ exerciseId: 'bench', sets: [[100, 5], [90, 5]] }]),
    ]);
    expect(second.prCount).toBe(0);
  });

  it('ignores warm-ups for PRs, volume and set counts', () => {
    const [, second] = annotateWorkouts([
      workout('2026-10-01', [{ exerciseId: 'bench', sets: [[100, 5]] }]),
      workout('2026-10-03', [{ exerciseId: 'bench', sets: [[140, 5, true], [95, 5]] }]),
    ]);
    expect(second.prCount).toBe(0);
    expect(second.setCount).toBe(1);
    expect(second.volume).toBe(475);
    expect(second.exercises[0].sets[0].e1rm).toBe(0);
  });

  it('tracks PRs per exercise independently', () => {
    const [, second] = annotateWorkouts([
      workout('2026-10-01', [{ exerciseId: 'bench', sets: [[100, 5]] }]),
      workout('2026-10-03', [
        { exerciseId: 'bench', sets: [[105, 5]] },
        { exerciseId: 'squat', sets: [[200, 5]] },
      ]),
    ]);
    expect(second.exercises.map((e) => e.sets[0].isPr)).toEqual([true, false]);
    expect(second.durationMin).toBe(60);
  });
});

describe('withTrend', () => {
  it('averages weigh-ins from the trailing 7 calendar days', () => {
    const t = withTrend([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-04', weightKg: 82 },
      { date: '2026-10-07', weightKg: 81 },
      { date: '2026-10-08', weightKg: 79 }, // 10-01 is now 7 days back, so it drops out
    ]);
    expect(t.map((x) => x.trendKg)).toEqual([80, 81, 81, 80.7]);
  });
});

describe('normalizeSupersets', () => {
  it('renumbers runs of 2+ consecutive exercises and drops singletons', () => {
    expect(normalizeSupersets([5, 5, null, 9, 9, 9, 2])).toEqual([0, 0, null, 1, 1, 1, null]);
  });
  it('splits a number that reappears after a gap', () => {
    expect(normalizeSupersets([1, 1, null, 1, 1])).toEqual([0, 0, null, 1, 1]);
    expect(normalizeSupersets([1, null, 1])).toEqual([null, null, null]);
  });
  it('handles empty and undefined input', () => {
    expect(normalizeSupersets([])).toEqual([]);
    expect(normalizeSupersets([undefined, undefined])).toEqual([null, null]);
  });
});

describe('manual records', () => {
  it('raise the PR baseline for later workouts only', () => {
    const ws = [workout('2026-01-01', [{ exerciseId: 'squat', sets: [[100, 5]] }]), workout('2026-01-10', [{ exerciseId: 'squat', sets: [[110, 5]] }])];
    // 120 × 5 entered on Jan 5: the Jan 10 session (110 × 5) no longer counts as a PR.
    expect(annotateWorkouts(ws, [{ exerciseId: 'squat', date: '2026-01-05', weightKg: 120, reps: 5 }])[1].prCount).toBe(0);
    // Entered after the session, it doesn't change history.
    expect(annotateWorkouts(ws, [{ exerciseId: 'squat', date: '2026-01-20', weightKg: 120, reps: 5 }])[1].prCount).toBe(1);
    // A manual record before the first session makes that session comparable (no longer just a baseline).
    expect(annotateWorkouts([ws[0]], [{ exerciseId: 'squat', date: '2025-12-01', weightKg: 90, reps: 5 }])[0].prCount).toBe(1);
  });

  it('recordProgressions lists each new best in order (current = last, previous = the one before)', () => {
    const training = annotateWorkouts([
      workout('2026-02-01', [{ exerciseId: 'bench', sets: [[80, 5], [85, 3], [60, 10, true]] }]),
      workout('2026-02-08', [{ exerciseId: 'bench', sets: [[80, 5]] }]), // no improvement
    ]);
    const list = recordProgressions(training, [{ id: 'r1', exerciseId: 'bench', date: '2026-02-15', weightKg: 90, reps: 5 }]).get('bench')!;
    expect(list.map((r) => [r.date, r.weightKg, r.reps, r.source])).toEqual([
      ['2026-02-01', 80, 5, 'workout'], // e1RM 93.3, then 85 × 3 = 93.5 edges it
      ['2026-02-01', 85, 3, 'workout'],
      ['2026-02-15', 90, 5, 'manual'],
    ]);
    expect(list.at(-1)).toMatchObject({ recordId: 'r1', e1rm: 105 });
  });
});
