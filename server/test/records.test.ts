import { describe, expect, it } from 'vitest';
import { libraryExercise, newUser, workoutBody } from './helpers.js';

type Row = { exerciseId: string; current: { weightKg: number; reps: number; source: string } | null; previous: { weightKg: number } | null; manual: { id: string }[] };

describe('records', () => {
  it('lists every exercise, with current and previous bests from workouts and manual entries', async () => {
    const { agent } = await newUser();
    const ex = await libraryExercise('Records Deadlift');
    const untouched = await libraryExercise('Records Untouched');
    await agent.post('/api/workouts').send(workoutBody(ex.id, [[140, 5]], '2026-09-01'));

    let rows: Row[] = (await agent.get('/api/records')).body;
    expect(rows.find((r) => r.exerciseId === untouched.id)).toMatchObject({ current: null, previous: null });
    expect(rows.find((r) => r.exerciseId === ex.id)).toMatchObject({ current: { weightKg: 140, reps: 5, source: 'workout' }, previous: null });

    const created = await agent.post('/api/records').send({ exerciseId: ex.id, date: '2026-09-10', weightKg: 150, reps: 5 });
    expect(created.status).toBe(201);
    rows = (await agent.get('/api/records')).body;
    expect(rows.find((r) => r.exerciseId === ex.id)).toMatchObject({ current: { weightKg: 150, source: 'manual' }, previous: { weightKg: 140 } });

    // The manual record now counts as history: a later 145 × 5 session isn't a PR.
    const w = (await agent.post('/api/workouts').send(workoutBody(ex.id, [[145, 5]], '2026-09-20'))).body;
    expect((await agent.get(`/api/workouts/${w.id}`)).body.prCount).toBe(0);

    expect((await agent.delete(`/api/records/${created.body.id}`)).status).toBe(204);
    rows = (await agent.get('/api/records')).body;
    expect(rows.find((r) => r.exerciseId === ex.id)).toMatchObject({ current: { weightKg: 145 }, previous: { weightKg: 140 }, manual: [] });
  });

  it('lift goals use manual records', async () => {
    const { agent } = await newUser();
    const ex = await libraryExercise('Records Press');
    await agent.post('/api/records').send({ exerciseId: ex.id, date: '2026-09-10', weightKg: 60, reps: 1 });
    await agent.post('/api/goals').send({ type: 'lift', title: 'Press 80', exerciseId: ex.id, targetValue: 80 });
    const [goal] = (await agent.get('/api/goals')).body;
    expect(goal).toMatchObject({ startValue: 60, current: 60 });
  });

  it('validates input', async () => {
    const { agent } = await newUser();
    const ex = await libraryExercise('Records Press');
    expect((await agent.post('/api/records').send({ exerciseId: ex.id, date: '2026-09-10', weightKg: 60, reps: 0 })).status).toBe(400);
    expect((await agent.post('/api/records').send({ exerciseId: 'nope', date: '2026-09-10', weightKg: 60, reps: 3 })).status).toBe(400);
  });
});
