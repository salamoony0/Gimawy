import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/core.js';

export { app, prisma };

export const PASSWORD = 'password1';

/** Registers a fresh account and returns a cookie-keeping agent for it. */
export async function newUser(name = 'user') {
  const agent = request.agent(app);
  const email = `${name}-${randomUUID()}@test.io`;
  const res = await agent.post('/api/auth/register').send({ email, password: PASSWORD, name });
  expect(res.status).toBe(201);
  return { agent, email, id: res.body.id as string };
}

/** A built-in (library) exercise, shared by every user. */
export async function libraryExercise(name = 'Test Bench Press') {
  const existing = await prisma.exercise.findFirst({ where: { name, userId: null } });
  return existing ?? prisma.exercise.create({ data: { name, muscleGroup: 'chest', equipment: 'barbell' } });
}

export function workoutBody(exerciseId: string, sets: Array<[weightKg: number, reps: number]>, date = '2026-10-01') {
  return {
    name: 'Push',
    date,
    startedAt: `${date}T10:00:00Z`,
    endedAt: `${date}T11:00:00Z`,
    exercises: [{ exerciseId, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })) }],
  };
}
