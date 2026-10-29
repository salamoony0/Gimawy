import { beforeAll, describe, expect, it, vi } from 'vitest';
import { libraryExercise, newUser, prisma, workoutBody } from './helpers.js';

// User A owns one of everything; user B must not be able to read, change or delete any of it,
// and must not see it in their own lists or stats.
let a: Awaited<ReturnType<typeof newUser>>;
let b: Awaited<ReturnType<typeof newUser>>;
const ids = {} as Record<'workout' | 'routine' | 'cardio' | 'food' | 'goal' | 'liftGoal' | 'exercise' | 'record', string>;
const date = '2026-10-05';

beforeAll(async () => {
  a = await newUser('owner');
  b = await newUser('intruder');
  const lib = await libraryExercise();

  ids.exercise = (await a.agent.post('/api/exercises').send({ name: 'Secret Press', muscleGroup: 'chest', equipment: 'machine' })).body.id;
  ids.workout = (await a.agent.post('/api/workouts').send(workoutBody(ids.exercise, [[80, 8]], date))).body.id;
  ids.routine = (await a.agent.post('/api/routines').send({ name: 'A day', exercises: [{ exerciseId: lib.id, targetSets: 3, targetReps: 8 }] })).body.id;
  ids.cardio = (await a.agent.post('/api/cardio').send({ type: 'run', date, durationMin: 30 })).body.id;
  await a.agent.post('/api/food').send({ date, meal: 'lunch', items: [{ name: 'Secret salad', calories: 300, protein: 10, carbs: 20, fat: 15 }] });
  await a.agent.post('/api/food').send({ date, meal: 'snack', source: 'barcode', items: [{ name: 'Secret bar', calories: 200, protein: 9, carbs: 20, fat: 8, barcode: '4000000000017' }] });
  ids.food = (await a.agent.get(`/api/food?date=${date}`)).body.find((f: { name: string }) => f.name === 'Secret salad').id;
  await a.agent.put(`/api/body/${date}`).send({ weightKg: 90 });
  ids.goal = (await a.agent.post('/api/goals').send({ type: 'weight', title: 'Cut', targetValue: 80 })).body.id;
  ids.liftGoal = (await a.agent.post('/api/goals').send({ type: 'lift', title: 'Press', exerciseId: ids.exercise, targetValue: 120 })).body.id;
  ids.record = (await a.agent.post('/api/records').send({ exerciseId: lib.id, date, weightKg: 222, reps: 2 })).body.id;
  expect(Object.values(ids).every(Boolean)).toBe(true);
});

describe('cross-user isolation', () => {
  it('B gets 404 reading A’s workout and custom exercise', async () => {
    expect((await b.agent.get(`/api/workouts/${ids.workout}`)).status).toBe(404);
    expect((await b.agent.get(`/api/exercises/${ids.exercise}`)).status).toBe(404);
    // "last time" is scoped to the caller's own workouts, so B just gets nothing.
    expect((await b.agent.get(`/api/exercises/${ids.exercise}/last`)).body).toBeNull();
  });

  it('B gets 404 changing A’s items', async () => {
    const lib = await libraryExercise();
    const results = await Promise.all([
      b.agent.put(`/api/workouts/${ids.workout}`).send(workoutBody(lib.id, [[1, 1]])),
      b.agent.put(`/api/routines/${ids.routine}`).send({ name: 'x', exercises: [{ exerciseId: lib.id, targetSets: 1, targetReps: 1 }] }),
      b.agent.patch(`/api/cardio/${ids.cardio}`).send({ durationMin: 1 }),
      b.agent.patch(`/api/food/${ids.food}`).send({ name: 'hacked' }),
      b.agent.patch(`/api/goals/${ids.goal}`).send({ title: 'hacked' }),
      b.agent.patch(`/api/exercises/${ids.exercise}`).send({ name: 'hacked' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
  });

  it('B gets 404 deleting A’s items', async () => {
    const results = await Promise.all([
      b.agent.delete(`/api/workouts/${ids.workout}`),
      b.agent.delete(`/api/routines/${ids.routine}`),
      b.agent.delete(`/api/cardio/${ids.cardio}`),
      b.agent.delete(`/api/food/${ids.food}`),
      b.agent.delete(`/api/goals/${ids.goal}`),
      b.agent.delete(`/api/exercises/${ids.exercise}`),
    ]);
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
    // B deleting "their" weigh-in for that date must not touch A's.
    await b.agent.delete(`/api/body/${date}`);
    expect(await prisma.bodyWeight.count({ where: { userId: a.id, date } })).toBe(1);
  });

  it('B can’t use A’s custom exercise in a workout, routine or lift goal', async () => {
    expect((await b.agent.post('/api/workouts').send(workoutBody(ids.exercise, [[10, 10]]))).status).toBe(400);
    expect((await b.agent.post('/api/routines').send({ name: 'x', exercises: [{ exerciseId: ids.exercise, targetSets: 1, targetReps: 1 }] })).status).toBe(400);
    expect((await b.agent.post('/api/goals').send({ type: 'lift', title: 'x', exerciseId: ids.exercise, targetValue: 50 })).status).toBe(400);
  });

  it('B’s lists and stats contain none of A’s data', async () => {
    const [workouts, routines, cardio, food, body, goals, exercises, dash] = await Promise.all([
      b.agent.get('/api/workouts'),
      b.agent.get('/api/routines'),
      b.agent.get('/api/cardio'),
      b.agent.get(`/api/food?date=${date}`),
      b.agent.get('/api/body'),
      b.agent.get('/api/goals'),
      b.agent.get('/api/exercises'),
      b.agent.get(`/api/stats/dashboard?today=${date}`),
    ]);
    expect(workouts.body).toEqual([]);
    expect(routines.body).toEqual([]);
    expect(cardio.body).toEqual([]);
    expect(food.body).toEqual([]);
    expect(body.body).toEqual([]);
    expect(goals.body).toEqual([]);
    expect(exercises.body.some((e: { id: string }) => e.id === ids.exercise)).toBe(false);
    expect(dash.status).toBe(200);
    expect(JSON.stringify(dash.body)).not.toMatch(/Secret|Cut/);
  });

  it('B can’t see, delete or add records for A', async () => {
    expect((await b.agent.delete(`/api/records/${ids.record}`)).status).toBe(404);
    expect((await b.agent.post('/api/records').send({ exerciseId: ids.exercise, date, weightKg: 50, reps: 5 })).status).toBe(400);
    const rows = (await b.agent.get('/api/records')).body as { exerciseId: string; current: unknown; manual: unknown[] }[];
    expect(rows.some((r) => r.exerciseId === ids.exercise)).toBe(false); // A's custom exercise
    expect(rows.every((r) => r.current === null && r.manual.length === 0)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('222');
  });

  it('B’s barcode lookups never return A’s saved products', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 404 })));
    try {
      const res = await b.agent.get('/api/food/barcode/4000000000017');
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Secret');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('A’s data is untouched after all of that', async () => {
    const workout = await a.agent.get(`/api/workouts/${ids.workout}`);
    expect(workout.body.exercises[0].sets[0].weightKg).toBe(80);
    expect((await a.agent.get(`/api/food?date=${date}`)).body[0].name).toBe('Secret salad');
    expect((await a.agent.get('/api/goals')).body).toHaveLength(2);
    expect((await a.agent.get('/api/routines')).body).toHaveLength(1);
    expect((await a.agent.get('/api/cardio')).body[0].durationMin).toBe(30);
  });
});
