import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEMO_EMAIL } from '../src/lib/core.js';
import { app, libraryExercise, newUser, PASSWORD, prisma, workoutBody } from './helpers.js';

describe('register / login / me / logout', () => {
  it('registers, reads /me, logs out and back in', async () => {
    const { agent, email } = await newUser('alice');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, onboarded: false, latestWeightKg: null });
    expect(me.body.passwordHash).toBeUndefined();
    expect(me.body.tokenVersion).toBeUndefined();

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const login = await agent.post('/api/auth/login').send({ email: email.toUpperCase(), password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.passwordHash).toBeUndefined();
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('stores the adaptive-target settings on the profile', async () => {
    const { agent } = await newUser();
    expect((await agent.get('/api/auth/me')).body).toMatchObject({ autoAdjustTargets: false, targetsAdjustedAt: null });
    const res = await agent.patch('/api/auth/me').send({ autoAdjustTargets: true, targetsAdjustedAt: '2026-10-29', calorieTarget: 2450 });
    expect(res.body).toMatchObject({ autoAdjustTargets: true, targetsAdjustedAt: '2026-10-29', calorieTarget: 2450 });
    expect((await agent.patch('/api/auth/me').send({ targetsAdjustedAt: 'last week' })).status).toBe(400);
  });

  it('rejects duplicate emails, short passwords and wrong passwords', async () => {
    const { email } = await newUser();
    expect((await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: 'x' })).status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ email: 'new@test.io', password: 'short', name: 'x' })).status).toBe(400);
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.io', password: PASSWORD });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('requires a session for data routes and rejects forged tokens', async () => {
    expect((await request(app).get('/api/workouts')).status).toBe(401);
    const forged = await request(app).get('/api/workouts').set('Cookie', 'gymawy_token=not.a.jwt');
    expect(forged.status).toBe(401);
  });
});

describe('sessions (tokenVersion)', () => {
  it('changing the password signs out other sessions but keeps this one', async () => {
    const { agent, email } = await newUser();
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email, password: PASSWORD });

    expect((await agent.patch('/api/auth/password').send({ current: 'wrong-password', next: 'password2' })).status).toBe(403);
    expect((await agent.patch('/api/auth/password').send({ current: PASSWORD, next: 'password2' })).status).toBe(204);

    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'password2' })).status).toBe(200);
  });

  it('log out everywhere invalidates every session, this one included', async () => {
    const { agent, email } = await newUser();
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email, password: PASSWORD });
    const stolen = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).headers['set-cookie'] as unknown as string[];
    expect((await request(app).get('/api/auth/me').set('Cookie', stolen)).status).toBe(200);

    expect((await agent.post('/api/auth/logout-all')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', stolen)).status).toBe(401);
  });
});

describe('export and delete', () => {
  it('exports only the signed-in user’s data', async () => {
    const a = await newUser('a');
    const b = await newUser('b');
    const ex = await libraryExercise();
    await a.agent.post('/api/workouts').send(workoutBody(ex.id, [[100, 5]]));
    await b.agent.post('/api/workouts').send(workoutBody(ex.id, [[60, 5]]));

    const res = await a.agent.get('/api/auth/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="gymawy-export-/);
    expect(res.body.user.email).toBe(a.email);
    expect(res.body.workouts).toHaveLength(1);
    expect(res.body.workouts[0].exercises[0].sets[0].weightKg).toBe(100);
  });

  it('deletes the account and all its data after checking the password', async () => {
    const { agent, id } = await newUser();
    const ex = await libraryExercise();
    await agent.post('/api/workouts').send(workoutBody(ex.id, [[100, 5]]));
    await agent.post('/api/food').send({ date: '2026-10-01', meal: 'lunch', items: [{ name: 'Rice', calories: 200, protein: 4, carbs: 44, fat: 0 }] });

    expect((await agent.delete('/api/auth/me').send({ password: 'wrong-password' })).status).toBe(403);
    expect((await agent.delete('/api/auth/me').send({ password: PASSWORD })).status).toBe(204);

    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.workout.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.foodEntry.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.exercise.count({ where: { id: ex.id } })).toBe(1); // library exercise untouched
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('protects the shared demo account', async () => {
    const agent = request.agent(app);
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    await agent.post('/api/auth/register').send({ email: DEMO_EMAIL, password: 'demo1234', name: 'Demo' });
    expect((await agent.patch('/api/auth/password').send({ current: 'demo1234', next: 'password2' })).status).toBe(403);
    expect((await agent.delete('/api/auth/me').send({ password: 'demo1234' })).status).toBe(403);
  });
});

describe('demo availability', () => {
  it('reports whether the demo account exists', async () => {
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    expect((await request(app).get('/api/auth/demo')).body).toEqual({ available: false });
    await request(app).post('/api/auth/register').send({ email: DEMO_EMAIL, password: 'demo1234', name: 'Demo' });
    expect((await request(app).get('/api/auth/demo')).body).toEqual({ available: true });
  });
});
