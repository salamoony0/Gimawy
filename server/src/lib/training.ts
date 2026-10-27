import { prisma, e1rm, round1 } from './core.js';

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

/**
 * Loads every workout for a user in chronological order and annotates each
 * working set with its estimated 1RM and whether it beat every earlier set of
 * that exercise (a PR). The first session of an exercise only sets the
 * baseline, so it never counts as a PR.
 */
export async function loadTraining(userId: string): Promise<AnnotatedWorkout[]> {
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { startedAt: 'asc' }],
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: { exercise: true, sets: { orderBy: { order: 'asc' } } },
      },
    },
  });

  const best = new Map<string, number>();

  return workouts.map((w) => {
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
