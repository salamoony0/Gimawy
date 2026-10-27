import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUser, prisma } from './helpers.js';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  ThinkingLevel: { LOW: 'LOW' },
}));

const answer = {
  source: 'text',
  confidence: 'medium',
  mealName: 'Eggs on toast',
  notes: '',
  items: [{ name: 'Egg', quantity: '2 large', calories: 143.4, protein: 12.56, carbs: 0.7, fat: 9.5 }],
};

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_DAILY_LIMIT = '2';
});
beforeEach(() => generateContent.mockReset());

const usage = (userId: string) => prisma.aiUsage.findFirst({ where: { userId } }).then((r) => r?.count ?? 0);

describe('AI food analysis', () => {
  it('returns a rounded draft and counts usage per user per day', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(answer) });
    const { agent, id } = await newUser();
    const res = await agent.post('/api/ai/analyze-food').send({ hint: 'two eggs' });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ calories: 143, protein: 12.6 });
    expect(await usage(id)).toBe(1);
  });

  it('enforces the daily limit (stored in the database)', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(answer) });
    const { agent, id } = await newUser();
    expect((await agent.post('/api/ai/analyze-food').send({ hint: 'a' })).status).toBe(200);
    expect((await agent.post('/api/ai/analyze-food').send({ hint: 'b' })).status).toBe(200);
    const third = await agent.post('/api/ai/analyze-food').send({ hint: 'c' });
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/Daily AI scan limit/);
    expect(await usage(id)).toBe(2);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('refunds the scan when Gemini fails or answers nonsense', async () => {
    const { agent, id } = await newUser();
    generateContent.mockRejectedValue(Object.assign(new Error('overloaded'), { status: 503 }));
    expect((await agent.post('/api/ai/analyze-food').send({ hint: 'a' })).status).toBe(503);
    expect(generateContent).toHaveBeenCalledTimes(2); // primary + fallback model
    generateContent.mockResolvedValue({ text: 'not json' });
    expect((await agent.post('/api/ai/analyze-food').send({ hint: 'b' })).status).toBe(502);
    expect(await usage(id)).toBe(0);
  });

  it('needs an image or a description', async () => {
    const { agent } = await newUser();
    expect((await agent.post('/api/ai/analyze-food').send({})).status).toBe(400);
  });
});
