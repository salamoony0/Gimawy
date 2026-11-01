import { describe, expect, it } from 'vitest';
import { libraryExercise, newUser, prisma, workoutBody } from './helpers.js';

describe('workout editing', () => {
  it('PUT replaces every set and moves the PR flag', async () => {
    const { agent } = await newUser();
    const ex = await libraryExercise('PUT Test Squat');
    await agent.post('/api/workouts').send(workoutBody(ex.id, [[100, 5]], '2026-10-01'));
    const id = (await agent.post('/api/workouts').send(workoutBody(ex.id, [[95, 5], [95, 5]], '2026-10-03'))).body.id;

    let w = (await agent.get(`/api/workouts/${id}`)).body;
    expect(w.prCount).toBe(0);

    const put = await agent.put(`/api/workouts/${id}`).send({ ...workoutBody(ex.id, [[110, 5]], '2026-10-04'), name: 'Heavy' });
    expect(put.status).toBe(200);

    w = (await agent.get(`/api/workouts/${id}`)).body;
    expect(w).toMatchObject({ name: 'Heavy', date: '2026-10-04', prCount: 1 });
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].sets.map((s: { weightKg: number; isPr: boolean }) => [s.weightKg, s.isPr])).toEqual([[110, true]]);
    // The old rows are gone, not orphaned.
    expect(await prisma.workoutSet.count({ where: { workoutExercise: { workoutId: id } } })).toBe(1);
  });

  it('refuses to delete a custom exercise that is used in a workout', async () => {
    const { agent } = await newUser();
    const ex = (await agent.post('/api/exercises').send({ name: 'Used Curl', muscleGroup: 'biceps', equipment: 'dumbbell' })).body;
    await agent.post('/api/workouts').send(workoutBody(ex.id, [[20, 10]]));
    expect((await agent.delete(`/api/exercises/${ex.id}`)).status).toBe(409);
    const unused = (await agent.post('/api/exercises').send({ name: 'Unused Curl', muscleGroup: 'biceps', equipment: 'dumbbell' })).body;
    expect((await agent.delete(`/api/exercises/${unused.id}`)).status).toBe(204);
  });

  it('can’t edit or delete library exercises', async () => {
    const { agent } = await newUser();
    const lib = await libraryExercise();
    expect((await agent.patch(`/api/exercises/${lib.id}`).send({ name: 'Mine now' })).status).toBe(404);
    expect((await agent.delete(`/api/exercises/${lib.id}`)).status).toBe(404);
  });
});

describe('supersets', () => {
  it('stores contiguous groups, drops singletons and returns them on the workout', async () => {
    const { agent } = await newUser();
    const [a, b, c] = await Promise.all(['SS Bench', 'SS Row', 'SS Curl'].map((n) => libraryExercise(n)));
    const sets = [{ weightKg: 50, reps: 10 }];
    const id = (
      await agent.post('/api/workouts').send({
        ...workoutBody(a.id, [[50, 10]]),
        exercises: [
          { exerciseId: a.id, supersetGroup: 7, sets },
          { exerciseId: b.id, supersetGroup: 7, sets },
          { exerciseId: c.id, supersetGroup: 3, sets }, // alone: not a superset
        ],
      })
    ).body.id;
    const w = (await agent.get(`/api/workouts/${id}`)).body;
    expect(w.exercises.map((e: { supersetGroup: number | null }) => e.supersetGroup)).toEqual([0, 0, null]);
  });

  it('routines keep superset groups', async () => {
    const { agent } = await newUser();
    const [a, b] = await Promise.all(['SS Bench', 'SS Row'].map((n) => libraryExercise(n)));
    const r = await agent.post('/api/routines').send({
      name: 'Pairs',
      exercises: [
        { exerciseId: a.id, targetSets: 3, targetReps: 10, supersetGroup: 1 },
        { exerciseId: b.id, targetSets: 3, targetReps: 10, supersetGroup: 1 },
      ],
    });
    expect(r.body.exercises.map((e: { supersetGroup: number | null }) => e.supersetGroup)).toEqual([0, 0]);
  });
});

describe('offline replay', () => {
  it('posting the same session twice returns the saved workout instead of a duplicate', async () => {
    const { agent, id: userId } = await newUser();
    const ex = await libraryExercise();
    const first = await agent.post('/api/workouts').send(workoutBody(ex.id, [[60, 8]], '2026-09-01'));
    const again = await agent.post('/api/workouts').send(workoutBody(ex.id, [[60, 8]], '2026-09-01'));
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.workout.count({ where: { userId } })).toBe(1);
  });

  it('two saves of the same session at the same moment still make one workout', async () => {
    const { agent, id: userId } = await newUser();
    const ex = await libraryExercise();
    const body = workoutBody(ex.id, [[60, 8]], '2026-09-02');
    const [a, b] = await Promise.all([agent.post('/api/workouts').send(body), agent.post('/api/workouts').send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.workout.count({ where: { userId } })).toBe(1);
  });

  it('a replayed food or cardio POST with the same Idempotency-Key is answered once', async () => {
    const { agent, id: userId } = await newUser();
    const food = { date: '2026-09-03', meal: 'lunch', items: [{ name: 'Rice', calories: 200, protein: 4, carbs: 44, fat: 0.5 }] };
    const first = await agent.post('/api/food').set('Idempotency-Key', 'food-1').send(food);
    const again = await agent.post('/api/food').set('Idempotency-Key', 'food-1').send(food);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(await prisma.foodEntry.count({ where: { userId } })).toBe(1);

    const cardio = { type: 'run', date: '2026-09-03', durationMin: 30 };
    const c1 = await agent.post('/api/cardio').set('Idempotency-Key', 'cardio-1').send(cardio);
    const c2 = await agent.post('/api/cardio').set('Idempotency-Key', 'cardio-1').send(cardio);
    expect(c2.body.id).toBe(c1.body.id);
    expect(await prisma.cardioSession.count({ where: { userId } })).toBe(1);

    // A new key is a new entry; no key keeps the old behaviour.
    await agent.post('/api/food').set('Idempotency-Key', 'food-2').send(food);
    await agent.post('/api/food').send(food);
    expect(await prisma.foodEntry.count({ where: { userId } })).toBe(3);
  });

  it('a failed request with a key can be retried', async () => {
    const { agent, id: userId } = await newUser();
    const bad = await agent.post('/api/food').set('Idempotency-Key', 'retry-1').send({ date: '2026-09-04', meal: 'lunch', items: [] });
    expect(bad.status).toBe(400);
    const food = { date: '2026-09-04', meal: 'lunch', items: [{ name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3 }] };
    expect((await agent.post('/api/food').set('Idempotency-Key', 'retry-1').send(food)).status).toBe(201);
    expect(await prisma.foodEntry.count({ where: { userId } })).toBe(1);
  });
});

describe('stored weights', () => {
  it('weigh-ins are kept to 2 decimals like sets and records', async () => {
    const { agent } = await newUser();
    await agent.put('/api/body/2026-09-05').send({ weightKg: 81.4372 });
    expect((await agent.get('/api/body')).body.at(-1).weightKg).toBe(81.44);
  });
});
