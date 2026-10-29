import type { Prisma } from '@prisma/client';
import { prisma, e1rm, round1, HttpError } from './core.js';

export type AnnotatedSet = {
  id: string;
  order: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
  e1rm: number;
  isPr: boolean;
};

export type AnnotatedExercise = {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  order: number;
  supersetGroup: number | null;
  volume: number;
  bestE1rm: number;
  sets: AnnotatedSet[];
};

export type AnnotatedWorkout = {
  id: string;
  name: string;
  date: string;
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
  durationMin: number | null;
  calories: number | null;
  volume: number;
  setCount: number;
  prCount: number;
  exercises: AnnotatedExercise[];
};

const workoutInclude = {
  exercises: {
    orderBy: { order: 'asc' },
    include: { exercise: true, sets: { orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.WorkoutInclude;

export type WorkoutRow = Prisma.WorkoutGetPayload<{ include: typeof workoutInclude }>;

export type ManualRecord = { id: string; exerciseId: string; date: string; weightKg: number; reps: number };

/** Loads every workout for a user in chronological order, annotated (see annotateWorkouts). */
export async function loadTraining(userId: string): Promise<AnnotatedWorkout[]> {
  const [workouts, manual] = await Promise.all([
    prisma.workout.findMany({
      where: { userId },
      orderBy: [{ date: 'asc' }, { startedAt: 'asc' }],
      include: workoutInclude,
    }),
    loadManualRecords(userId),
  ]);
  return annotateWorkouts(workouts, manual);
}

export function loadManualRecords(userId: string): Promise<ManualRecord[]> {
  return prisma.personalRecord.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, exerciseId: true, date: true, weightKg: true, reps: true },
  });
}

/**
 * Annotates each working set (rows in chronological order) with its estimated
 * 1RM and whether it beat every earlier set of that exercise (a PR). The first
 * session of an exercise only sets the baseline, so it never counts as a PR. Records entered by hand (`manual`)
 * count as history from their date on: a later workout is only a PR if it beats them too.
 */
export function annotateWorkouts(workouts: WorkoutRow[], manual: Omit<ManualRecord, 'id'>[] = []): AnnotatedWorkout[] {
  const best = new Map<string, number>();
  const pending = [...manual].sort((a, b) => a.date.localeCompare(b.date));
  let next = 0;

  return workouts.map((w) => {
    for (; next < pending.length && pending[next].date < w.date; next++) {
      const r = pending[next];
      best.set(r.exerciseId, Math.max(best.get(r.exerciseId) ?? 0, round1(e1rm(r.weightKg, r.reps))));
    }
    let prCount = 0;
    let volume = 0;
    let setCount = 0;
    const exercises = w.exercises.map((we) => {
      const prior = best.get(we.exerciseId);
      let sessionBest = 0;
      let exVolume = 0;
      const sets = we.sets.map((s) => {
        const est = s.isWarmup ? 0 : e1rm(s.weightKg, s.reps);
        if (!s.isWarmup) {
          exVolume += s.weightKg * s.reps;
          setCount++;
        }
        return { ...s, e1rm: round1(est), isPr: false };
      });
      // Only the single best set of the session is flagged, and only if it beats history.
      let bestIdx = -1;
      sets.forEach((s, i) => {
        if (s.e1rm > sessionBest) {
          sessionBest = s.e1rm;
          bestIdx = i;
        }
      });
      if (prior !== undefined && bestIdx >= 0 && sessionBest > prior) {
        sets[bestIdx].isPr = true;
        prCount++;
      }
      best.set(we.exerciseId, Math.max(prior ?? 0, sessionBest));
      volume += exVolume;
      return {
        id: we.id,
        exerciseId: we.exerciseId,
        name: we.exercise.name,
        muscleGroup: we.exercise.muscleGroup,
        equipment: we.exercise.equipment,
        order: we.order,
        supersetGroup: we.supersetGroup,
        volume: Math.round(exVolume),
        bestE1rm: sessionBest,
        sets: sets.map(({ workoutExerciseId: _, ...rest }) => rest),
      };
    });
    return {
      id: w.id,
      name: w.name,
      date: w.date,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      notes: w.notes,
      durationMin: w.endedAt ? Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000) : null,
      calories: w.calories,
      volume: Math.round(volume),
      setCount,
      prCount,
      exercises,
    };
  });
}

export function summarize(w: AnnotatedWorkout) {
  const muscles = [...new Set(w.exercises.map((e) => e.muscleGroup))];
  return {
    id: w.id,
    name: w.name,
    date: w.date,
    durationMin: w.durationMin,
    calories: w.calories,
    volume: w.volume,
    setCount: w.setCount,
    prCount: w.prCount,
    muscles,
    exercises: w.exercises.map((e) => ({
      name: e.name,
      sets: e.sets.filter((s) => !s.isWarmup).length,
      best: e.sets.reduce<AnnotatedSet | null>((b, s) => (!s.isWarmup && (!b || s.e1rm > b.e1rm) ? s : b), null),
    })),
  };
}

export type RecordEntry = {
  date: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  source: 'workout' | 'manual';
  workoutId?: string;
  recordId?: string;
};

/**
 * Per exercise, the sets that set a new best e1RM when they happened, oldest first: the last one is the current
 * record and the one before it the previous record. Workout sets (warm-ups excluded) and manual records are
 * merged by date; on the same day a manual record counts after that day's workouts.
 */
export function recordProgressions(training: AnnotatedWorkout[], manual: ManualRecord[]): Map<string, RecordEntry[]> {
  const entries: (RecordEntry & { exerciseId: string; rank: number })[] = [];
  training.forEach((w, wi) => {
    for (const e of w.exercises)
      for (const s of e.sets)
        if (!s.isWarmup && s.reps > 0)
          entries.push({ exerciseId: e.exerciseId, date: w.date, weightKg: s.weightKg, reps: s.reps, e1rm: s.e1rm, source: 'workout', workoutId: w.id, rank: wi });
  });
  manual.forEach((r, i) =>
    entries.push({
      exerciseId: r.exerciseId,
      date: r.date,
      weightKg: r.weightKg,
      reps: r.reps,
      e1rm: round1(e1rm(r.weightKg, r.reps)),
      source: 'manual',
      recordId: r.id,
      rank: training.length + i,
    }),
  );
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);

  const out = new Map<string, RecordEntry[]>();
  for (const { exerciseId, rank: _, ...entry } of entries) {
    const list = out.get(exerciseId) ?? [];
    if (!list.length || entry.e1rm > list[list.length - 1].e1rm) list.push(entry);
    out.set(exerciseId, list);
  }
  return out;
}

/**
 * Normalises superset numbers for an ordered list: a superset is a run of consecutive exercises with the same
 * number. Runs are renumbered 0, 1, 2… in order; a number that only covers one exercise (or reappears later,
 * non-adjacent) is dropped or split, so stored groups are always contiguous and have 2+ members.
 */
export function normalizeSupersets(groups: (number | null | undefined)[]): (number | null)[] {
  const out: (number | null)[] = groups.map(() => null);
  let next = 0;
  for (let i = 0; i < groups.length; ) {
    let j = i + 1;
    if (groups[i] != null) while (j < groups.length && groups[j] === groups[i]) j++;
    if (j - i >= 2) {
      for (let k = i; k < j; k++) out[k] = next;
      next++;
    }
    i = j;
  }
  return out;
}

/** Built-in or the user's own exercises only (ids from another account are rejected). */
export async function assertExercisesVisible(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const count = await prisma.exercise.count({
    where: { id: { in: unique }, OR: [{ userId: null }, { userId }] },
  });
  if (count !== unique.length) throw new HttpError(400, 'Unknown exercise');
}
