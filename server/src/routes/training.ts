import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, HttpError, zDay, param } from '../lib/core.js';
import { assertExercisesVisible, loadTraining, normalizeSupersets, summarize } from '../lib/training.js';

export const trainingRouter = Router();

const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core', 'full body'] as const;
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'] as const;

// ---------- exercises ----------

trainingRouter.get('/exercises', async (req, res) => {
  const [exercises, usage] = await Promise.all([
    prisma.exercise.findMany({
      where: { OR: [{ userId: null }, { userId: req.userId }] },
      orderBy: { name: 'asc' },
    }),
    prisma.workoutExercise.groupBy({
      by: ['exerciseId'],
      where: { workout: { userId: req.userId } },
      _count: true,
    }),
  ]);
  const counts = new Map(usage.map((u) => [u.exerciseId, u._count]));
  res.json(
    exercises.map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      isCustom: e.userId !== null,
      timesPerformed: counts.get(e.id) ?? 0,
    })),
  );
});

trainingRouter.post('/exercises', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(60),
      muscleGroup: z.enum(MUSCLES),
      equipment: z.enum(EQUIPMENT),
    })
    .parse(req.body);
  const e = await prisma.exercise.create({ data: { ...body, userId: req.userId } });
  res.status(201).json({ ...e, isCustom: true, timesPerformed: 0 });
});

trainingRouter.get('/exercises/:id', async (req, res) => {
  const id = param(req, 'id');
  const exercise = await prisma.exercise.findFirst({
    where: { id, OR: [{ userId: null }, { userId: req.userId }] },
  });
  if (!exercise) throw new HttpError(404, 'Exercise not found');

  const training = await loadTraining(req.userId);
  const sessions = training.flatMap((w) =>
    w.exercises
      .filter((e) => e.exerciseId === id)
      .map((e) => {
        const working = e.sets.filter((s) => !s.isWarmup);
        const top = working.reduce((b, s) => (s.weightKg > b.weightKg ? s : b), working[0]);
        return {
          workoutId: w.id,
          workoutName: w.name,
          date: w.date,
          e1rm: e.bestE1rm,
          topWeightKg: top?.weightKg ?? 0,
          volume: e.volume,
          totalReps: working.reduce((n, s) => n + s.reps, 0),
          isPr: e.sets.some((s) => s.isPr),
          sets: e.sets,
        };
      }),
  );

  const allSets = sessions.flatMap((s) => s.sets.filter((x) => !x.isWarmup).map((x) => ({ ...x, date: s.date })));
  const pick = <T,>(arr: T[], score: (t: T) => number) =>
    arr.reduce<T | null>((b, t) => (!b || score(t) > score(b) ? t : b), null);

  res.json({
    exercise: { ...exercise, isCustom: exercise.userId !== null },
    sessions: sessions.reverse(),
    records: {
      bestE1rm: pick(allSets, (s) => s.e1rm),
      heaviest: pick(allSets, (s) => s.weightKg * 1000 + s.reps),
      mostReps: pick(allSets, (s) => s.reps * 1000 + s.weightKg),
      bestVolume: pick(sessions, (s) => s.volume),
    },
  });
});

async function ownCustomExercise(userId: string, id: string) {
  const e = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!e) throw new HttpError(404, 'Custom exercise not found');
  return e;
}

trainingRouter.patch('/exercises/:id', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(60),
      muscleGroup: z.enum(MUSCLES),
      equipment: z.enum(EQUIPMENT),
    })
    .partial()
    .parse(req.body);
  await ownCustomExercise(req.userId, param(req, 'id'));
  const e = await prisma.exercise.update({ where: { id: param(req, 'id') }, data: body });
  res.json({ ...e, isCustom: true });
});

/** Deleting would cascade into workout history, so only unused custom exercises can go. */
trainingRouter.delete('/exercises/:id', async (req, res) => {
  const id = param(req, 'id');
  await ownCustomExercise(req.userId, id);
  const used = await prisma.workoutExercise.count({ where: { exerciseId: id } });
  if (used) throw new HttpError(409, `Used in ${used} workout${used === 1 ? '' : 's'}. Rename it instead, or delete those workouts first.`);
  await prisma.$transaction([
    prisma.routineExercise.deleteMany({ where: { exerciseId: id } }),
    prisma.exercise.delete({ where: { id } }),
  ]);
  res.status(204).end();
});

/** The most recent sets logged for an exercise, shown as "previous" while logging. */
trainingRouter.get('/exercises/:id/last', async (req, res) => {
  const last = await prisma.workoutExercise.findFirst({
    where: { exerciseId: param(req, 'id'), workout: { userId: req.userId } },
    orderBy: [{ workout: { date: 'desc' } }, { workout: { startedAt: 'desc' } }],
    include: { sets: { orderBy: { order: 'asc' } }, workout: { select: { date: true } } },
  });
  res.json(last ? { date: last.workout.date, sets: last.sets } : null);
});

// ---------- workouts ----------

const setInput = z.object({
  reps: z.number().int().min(0).max(1000),
  weightKg: z.number().min(0).max(1500),
  rpe: z.number().min(1).max(10).nullable().optional(),
  isWarmup: z.boolean().optional(),
});

const workoutInput = z.object({
  name: z.string().trim().min(1).max(80),
  date: zDay,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  calories: z.number().int().min(0).max(5000).nullable().optional(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string(),
        supersetGroup: z.number().int().min(0).max(100).nullable().optional(),
        sets: z.array(setInput).min(1).max(50),
      }),
    )
    .min(1, 'add at least one exercise')
    .max(40),
});

function nestedExercises(exercises: z.infer<typeof workoutInput>['exercises']) {
  const groups = normalizeSupersets(exercises.map((e) => e.supersetGroup));
  return {
    create: exercises.map((e, i) => ({
      exerciseId: e.exerciseId,
      order: i,
      supersetGroup: groups[i],
      sets: {
        create: e.sets.map((s, j) => ({
          order: j,
          reps: s.reps,
          // lb inputs convert to long decimals; 2dp keeps the round trip exact on display.
          weightKg: Math.round(s.weightKg * 100) / 100,
          rpe: s.rpe ?? null,
          isWarmup: s.isWarmup ?? false,
        })),
      },
    })),
  };
}

trainingRouter.get('/workouts', async (req, res) => {
  const training = await loadTraining(req.userId);
  res.json(training.reverse().map(summarize));
});

trainingRouter.get('/workouts/:id', async (req, res) => {
  const training = await loadTraining(req.userId);
  const idx = training.findIndex((w) => w.id === param(req, 'id'));
  if (idx < 0) throw new HttpError(404, 'Workout not found');
  const w = training[idx];
  // Compare each exercise to the previous time it was performed.
  const exercises = w.exercises.map((e) => {
    let previous = null;
    for (let i = idx - 1; i >= 0 && !previous; i--) {
      const match = training[i].exercises.find((x) => x.exerciseId === e.exerciseId);
      if (match) previous = { date: training[i].date, volume: match.volume, bestE1rm: match.bestE1rm };
    }
    return { ...e, previous };
  });
  res.json({ ...w, exercises });
});

trainingRouter.post('/workouts', async (req, res) => {
  const body = workoutInput.parse(req.body);
  await assertExercisesVisible(req.userId, body.exercises.map((e) => e.exerciseId));
  // An offline save is replayed until a response arrives, so the same session may be posted twice.
  // startedAt identifies a session, so answer with the one already saved instead of duplicating it.
  const existing = await prisma.workout.findFirst({ where: { userId: req.userId, startedAt: body.startedAt }, select: { id: true } });
  if (existing) return void res.status(200).json(existing);
  const w = await prisma.workout.create({
    data: {
      userId: req.userId,
      name: body.name,
      date: body.date,
      startedAt: body.startedAt,
      endedAt: body.endedAt ?? new Date(),
      notes: body.notes ?? null,
      calories: body.calories ?? null,
      exercises: nestedExercises(body.exercises),
    },
  });
  res.status(201).json({ id: w.id });
});

trainingRouter.put('/workouts/:id', async (req, res) => {
  const id = param(req, 'id');
  const body = workoutInput.parse(req.body);
  const existing = await prisma.workout.findFirst({ where: { id, userId: req.userId } });
  if (!existing) throw new HttpError(404, 'Workout not found');
  await assertExercisesVisible(req.userId, body.exercises.map((e) => e.exerciseId));
  // Replace the whole exercise/set tree; simpler and safer than diffing.
  await prisma.$transaction([
    prisma.workoutExercise.deleteMany({ where: { workoutId: id } }),
    prisma.workout.update({
      where: { id },
      data: {
        name: body.name,
        date: body.date,
        startedAt: body.startedAt,
        endedAt: body.endedAt ?? existing.endedAt,
        notes: body.notes ?? null,
        calories: body.calories ?? existing.calories,
        exercises: nestedExercises(body.exercises),
      },
    }),
  ]);
  res.json({ id });
});

trainingRouter.delete('/workouts/:id', async (req, res) => {
  const { count } = await prisma.workout.deleteMany({ where: { id: param(req, 'id'), userId: req.userId } });
  if (!count) throw new HttpError(404, 'Workout not found');
  res.status(204).end();
});

// ---------- routines ----------

const routineInput = z.object({
  name: z.string().trim().min(1).max(60),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string(),
        targetSets: z.number().int().min(1).max(20),
        targetReps: z.number().int().min(1).max(100),
        supersetGroup: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .min(1)
    .max(30),
});

const routineInclude = {
  exercises: { orderBy: { order: 'asc' }, include: { exercise: true } },
} satisfies Prisma.RoutineInclude;

function shapeRoutine(r: Prisma.RoutineGetPayload<{ include: typeof routineInclude }>) {
  return {
    id: r.id,
    name: r.name,
    exercises: r.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.exercise.name,
      muscleGroup: e.exercise.muscleGroup,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      supersetGroup: e.supersetGroup,
    })),
  };
}

function routineRows(exercises: z.infer<typeof routineInput>['exercises']) {
  const groups = normalizeSupersets(exercises.map((e) => e.supersetGroup));
  return exercises.map((e, i) => ({ ...e, order: i, supersetGroup: groups[i] }));
}

trainingRouter.get('/routines', async (req, res) => {
  const routines = await prisma.routine.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
    include: routineInclude,
  });
  res.json(routines.map(shapeRoutine));
});

trainingRouter.post('/routines', async (req, res) => {
  const body = routineInput.parse(req.body);
  await assertExercisesVisible(req.userId, body.exercises.map((e) => e.exerciseId));
  const r = await prisma.routine.create({
    data: {
      userId: req.userId,
      name: body.name,
      exercises: { create: routineRows(body.exercises) },
    },
    include: routineInclude,
  });
  res.status(201).json(shapeRoutine(r));
});

trainingRouter.put('/routines/:id', async (req, res) => {
  const id = param(req, 'id');
  const body = routineInput.parse(req.body);
  const existing = await prisma.routine.findFirst({ where: { id, userId: req.userId } });
  if (!existing) throw new HttpError(404, 'Routine not found');
  await assertExercisesVisible(req.userId, body.exercises.map((e) => e.exerciseId));
  const [, r] = await prisma.$transaction([
    prisma.routineExercise.deleteMany({ where: { routineId: id } }),
    prisma.routine.update({
      where: { id },
      data: { name: body.name, exercises: { create: routineRows(body.exercises) } },
      include: routineInclude,
    }),
  ]);
  res.json(shapeRoutine(r));
});

trainingRouter.delete('/routines/:id', async (req, res) => {
  const { count } = await prisma.routine.deleteMany({ where: { id: param(req, 'id'), userId: req.userId } });
  if (!count) throw new HttpError(404, 'Routine not found');
  res.status(204).end();
});
