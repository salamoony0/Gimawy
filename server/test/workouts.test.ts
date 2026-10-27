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
