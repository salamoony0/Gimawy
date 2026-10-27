import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app, newUser, PASSWORD, prisma } from './helpers.js';

const { sent } = vi.hoisted(() => ({ sent: [] as Array<{ to: string; text: string }> }));
vi.mock('../src/lib/mailer.js', async (orig) => ({
  ...(await orig<typeof import('../src/lib/mailer.js')>()),
  sendMail: async (mail: { to: string; text: string }) => {
    sent.push(mail);
  },
}));

beforeEach(() => {
  sent.length = 0;
});

const tokenFrom = (text: string) => /reset\?token=([\w-]+)/.exec(text)![1];

describe('password reset', () => {
  it('answers 200 for unknown emails without sending anything', async () => {
    const res = await request(app).post('/api/auth/forgot').send({ email: 'nobody@test.io' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('emails a one-time link that sets a new password and signs out old sessions', async () => {
    const { agent, email } = await newUser();
    expect((await request(app).post('/api/auth/forgot').send({ email })).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain('http://app.test/reset?token=');
    const token = tokenFrom(sent[0].text);

    // Only a hash is stored.
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0);

    const fresh = request.agent(app);
    const reset = await fresh.post('/api/auth/reset').send({ token, password: 'new-password' });
    expect(reset.status).toBe(200);
    expect(reset.body.email).toBe(email);
    expect((await fresh.get('/api/auth/me')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    expect((await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'new-password' })).status).toBe(200);

    // Single use.
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'another-pass' })).status).toBe(400);
  });

  it('rejects expired tokens', async () => {
    const { email, id } = await newUser();
    await request(app).post('/api/auth/forgot').send({ email });
    await prisma.passwordResetToken.updateMany({ where: { userId: id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post('/api/auth/reset').send({ token: tokenFrom(sent[0].text), password: 'new-password' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });
});
