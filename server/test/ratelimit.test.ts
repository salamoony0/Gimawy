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

  it('limits reset emails to 5 per hour per address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post('/api/auth/forgot').send({ email: 'spam@test.io' })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
