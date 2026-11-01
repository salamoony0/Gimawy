import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, newUser, PASSWORD } from './helpers.js';

beforeAll(() => {
  process.env.RATE_LIMIT = 'on';
});
afterAll(() => {
  process.env.RATE_LIMIT = 'off';
});

describe('rate limits', () => {
  it('blocks the 11th failed login for an account, without counting successful ones', async () => {
    const { email } = await newUser();
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
    }
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Even the right password is refused while the account is locked.
    expect((await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(429);
  });

  it('a signed-in session gets 10 wrong current passwords, shared by password change and account deletion', async () => {
    const { agent } = await newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await agent.patch('/api/auth/password').send({ current: 'wrong-password', next: 'new-password1' })).status);
    for (let i = 0; i < 5; i++) statuses.push((await agent.delete('/api/auth/me').send({ password: 'wrong-password' })).status);
    expect(statuses.every((s) => s === 403)).toBe(true);
    expect((await agent.patch('/api/auth/password').send({ current: 'wrong-password', next: 'new-password1' })).status).toBe(429);
    expect((await agent.delete('/api/auth/me').send({ password: PASSWORD })).status).toBe(429);
  });

  it('signed-in auth routes count toward the per-user API limit', async () => {
    const { agent } = await newUser();
    const res = await agent.get('/api/auth/me');
    expect(res.headers['ratelimit-policy'] ?? res.headers['ratelimit']).toBeDefined();
  });

  it('limits reset emails to 5 per hour per address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post('/api/auth/forgot').send({ email: 'spam@test.io' })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
