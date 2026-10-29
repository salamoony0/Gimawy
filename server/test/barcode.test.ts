import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUser } from './helpers.js';
import { mapProduct } from '../src/lib/openfoodfacts.js';

// Open Food Facts is never called for real: fetch is stubbed per test (the lookup cache is per code, so each test
// uses its own barcode).
function stubOff(response: { status: number; body?: unknown } | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

const oats = {
  status: 1,
  product: {
    product_name: 'Rolled Oats',
    brands: 'Acme, Acme Foods',
    serving_size: '40 g',
    serving_quantity: 40,
    nutriments: { 'energy-kcal_100g': 372, proteins_100g: 13.5, carbohydrates_100g: 58.7, fat_100g: 7 },
  },
};

describe('mapProduct', () => {
  it('maps nutrition per 100 g, the first brand and the serving', () => {
    expect(mapProduct('1', oats.product)).toEqual({
      code: '1',
      name: 'Rolled Oats',
      brand: 'Acme',
      per100g: { calories: 372, protein: 13.5, carbs: 58.7, fat: 7 },
      serving: { label: '40 g', grams: 40 },
    });
  });
  it('converts kJ when kcal is missing and tolerates missing facts', () => {
    expect(mapProduct('1', { product_name: 'Juice', nutriments: { energy_100g: 418.4 } })?.per100g).toEqual({ calories: 100, protein: 0, carbs: 0, fat: 0 });
    expect(mapProduct('1', { product_name: 'Mystery' })?.per100g).toBeNull();
    expect(mapProduct('1', { brands: 'No name' })).toBeNull();
  });
});

describe('GET /food/barcode/:code', () => {
  it('returns the Open Food Facts product and caches it', async () => {
    const { agent } = await newUser();
    const fetch = stubOff({ status: 200, body: oats });
    const res = await agent.get('/api/food/barcode/5000000000011');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: '5000000000011', mine: null, product: { name: 'Rolled Oats', serving: { grams: 40 } } });
    await agent.get('/api/food/barcode/5000000000011');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('404s for unknown products and 400s for junk codes', async () => {
    const { agent } = await newUser();
    stubOff({ status: 404, body: { status: 0 } });
    expect((await agent.get('/api/food/barcode/5000000000028')).status).toBe(404);
    expect((await agent.get('/api/food/barcode/12ab')).status).toBe(400);
  });

  it('prefers the user’s own last entry, and still answers when Open Food Facts is down', async () => {
    const { agent } = await newUser();
    await agent.post('/api/food').send({
      date: '2026-10-05',
      meal: 'breakfast',
      source: 'barcode',
      items: [{ name: 'My protein bar', quantity: '1 bar', calories: 210, protein: 20, carbs: 22, fat: 7, barcode: '5000000000035' }],
    });
    stubOff(new Error('network down'));
    const res = await agent.get('/api/food/barcode/5000000000035');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ product: null, mine: { name: 'My protein bar', calories: 210 } });
    // Without a saved entry an outage is a 502, not a misleading "not found".
    expect((await agent.get('/api/food/barcode/5000000000042')).status).toBe(502);
  });
});
