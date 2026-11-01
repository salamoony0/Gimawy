import { app, newUser, prisma } from './helpers.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { toFoodRow, type FoodJson } from '../src/lib/foodSearch.js';

const FOODS: FoodJson[] = [
  { key: 'eg-koshari', name: 'Koshari', nameAr: 'كشري', aliases: 'koshary', kind: 'egyptian', source: 'estimate', per100g: { calories: 165, protein: 5.5, carbs: 28, fat: 3.8 }, servings: [{ label: 'Small plate', grams: 300 }, { label: 'Large plate', grams: 600 }] },
  { key: 'eg-taameya', name: "Ta'ameya", nameAr: 'طعمية', kind: 'egyptian', source: 'estimate', per100g: { calories: 333, protein: 13.3, carbs: 31.8, fat: 17.8 }, servings: [{ label: '1 piece', grams: 20 }] },
  { key: 'r-mcd-big-mac', name: 'Big Mac', brand: "McDonald's", nameAr: 'ماكدونالدز', kind: 'restaurant', source: 'published', serving: { label: '1 burger', calories: 590, protein: 25, carbs: 46, fat: 34 } },
];

beforeAll(async () => {
  const data = FOODS.map(toFoodRow).map((r) => ({ ...r, servings: r.servings ?? Prisma.DbNull }));
  await prisma.food.deleteMany({ where: { id: { in: data.map((d) => d.id) } } });
  await prisma.food.createMany({ data });
});
afterEach(() => vi.unstubAllGlobals());

describe('food search', () => {
  it('finds built-in foods by English name, alias, Arabic name and restaurant', async () => {
    const { agent } = await newUser();
    const names = async (q: string) => ((await agent.get('/api/food/search').query({ q })).body.foods as { name: string }[]).map((f) => f.name);
    expect(await names('koshari')).toContain('Koshari');
    expect(await names('KOSHARY')).toContain('Koshari');
    expect(await names('كشرى')).toContain('Koshari'); // ى/ي spelling variant
    expect(await names('طعميه')).toContain("Ta'ameya"); // ه/ة
    expect(await names('mcdonalds big mac')).toEqual(['Big Mac']);
  });

  it('returns the default serving’s nutrition and the other servings', async () => {
    const { agent } = await newUser();
    const res = await agent.get('/api/food/search').query({ q: 'koshari' });
    expect(res.body.foods[0]).toMatchObject({
      id: 'eg-koshari', serving: 'Small plate', grams: 300, calories: 495, servings: [{ label: 'Large plate', grams: 600 }], source: 'estimate',
    });
    expect(res.body.foods[0].search).toBeUndefined();
  });

  it('lists the user’s own matching foods first, once per name', async () => {
    const { agent } = await newUser();
    const item = { name: 'Mama’s koshari', quantity: '1 plate', calories: 700, protein: 20, carbs: 120, fat: 15 };
    await agent.post('/api/food').send({ date: '2026-10-01', meal: 'lunch', items: [item] });
    await agent.post('/api/food').send({ date: '2026-10-02', meal: 'lunch', items: [item] });
    const res = await agent.get('/api/food/search').query({ q: 'KOSHARI' });
    expect(res.body.mine).toEqual([{ name: item.name, quantity: '1 plate', calories: 700, protein: 20, carbs: 120, fat: 15 }]);
  });

  it('accepts entries logged from search', async () => {
    const { agent } = await newUser();
    const res = await agent.post('/api/food').send({ date: '2026-10-01', meal: 'lunch', source: 'search', items: [{ name: 'Koshari', quantity: 'Small plate', calories: 495, protein: 16.5, carbs: 84, fat: 11.4 }] });
    expect(res.status).toBe(201);
  });

  it('rejects empty queries and requires sign-in', async () => {
    const { agent } = await newUser();
    expect((await agent.get('/api/food/search').query({ q: '  ' })).status).toBe(400);
    expect((await request(app).get('/api/food/search').query({ q: 'koshari' })).status).toBe(401);
  });
});

describe('packaged product search (Open Food Facts)', () => {
  it('maps hits with nutrition and skips those without', async () => {
    const { agent } = await newUser();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      hits: [
        { code: '6221007012345', product_name: 'Full cream milk', brands: ['Juhayna'], serving_quantity: 250, serving_size: '250 ml', nutriments: { 'energy-kcal_100g': 60, proteins_100g: 3, carbohydrates_100g: 4.7, fat_100g: 3.2 } },
        { code: '6221007099999', product_name: 'No facts', brands: ['X'], nutriments: {} },
      ],
    }), { status: 200 })));
    const res = await agent.get('/api/food/search/products').query({ q: 'juhayna milk unique-1' });
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([
      { code: '6221007012345', name: 'Full cream milk', brand: 'Juhayna', per100g: { calories: 60, protein: 3, carbs: 4.7, fat: 3.2 }, serving: { label: '250 ml', grams: 250 } },
    ]);
  });

  it('answers 502 when Open Food Facts is down', async () => {
    const { agent } = await newUser();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await agent.get('/api/food/search/products').query({ q: 'anything unique-2' })).status).toBe(502);
  });
});
