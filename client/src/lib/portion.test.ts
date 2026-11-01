import { describe, expect, it } from 'vitest';
import { fromDbFood, fromMine, fromProduct, portionItem, unitsFor } from './portion';

const koshari = fromDbFood({
  id: 'eg-koshari', name: 'Koshari', nameAr: 'كشري', brand: null, kind: 'egyptian', source: 'estimate',
  serving: 'Small plate', grams: 300, calories: 495, protein: 16.5, carbs: 84, fat: 11.4, servings: [{ label: 'Large plate', grams: 600 }],
});

describe('portions', () => {
  it('offers the default serving, the other servings and grams when the weight is known', () => {
    expect(unitsFor(koshari).map((u) => u.label)).toEqual(['Small plate (300 g)', 'Large plate (600 g)', 'Grams']);
  });

  it('scales by servings, by another serving’s weight and by grams', () => {
    const [small, large, grams] = unitsFor(koshari);
    expect(portionItem(koshari, small, 1)).toEqual({ name: 'Koshari', quantity: 'Small plate', calories: 495, protein: 16.5, carbs: 84, fat: 11.4 });
    expect(portionItem(koshari, small, 2)).toMatchObject({ quantity: '2 × Small plate', calories: 990 });
    expect(portionItem(koshari, large, 1)).toMatchObject({ quantity: 'Large plate', calories: 990, protein: 33 });
    expect(portionItem(koshari, grams, 150)).toMatchObject({ quantity: '150 g', calories: 248, carbs: 42 });
  });

  it('per-item foods (restaurants, my past entries) only scale by count', () => {
    const bigMac = fromDbFood({
      id: 'r-mcd-big-mac', name: 'Big Mac', nameAr: null, brand: "McDonald's", kind: 'restaurant', source: 'published',
      serving: '1 burger', grams: null, calories: 590, protein: 25, carbs: 46, fat: 34, servings: null,
    });
    expect(unitsFor(bigMac).map((u) => u.label)).toEqual(['1 burger']);
    expect(portionItem(bigMac, unitsFor(bigMac)[0], 2)).toMatchObject({ name: "Big Mac (McDonald's)", quantity: '2 × 1 burger', calories: 1180 });

    const mine = fromMine({ name: 'Mama’s koshari', quantity: '1 plate', calories: 700, protein: 20, carbs: 120, fat: 15 });
    expect(portionItem(mine, unitsFor(mine)[0], 0.5)).toMatchObject({ quantity: '0.5 × 1 plate', calories: 350 });
  });

  it('packaged products start at their pack serving, or 100 g', () => {
    const milk = fromProduct({ code: '6221007012345', name: 'Full cream milk', brand: 'Juhayna', per100g: { calories: 60, protein: 3, carbs: 4.7, fat: 3.2 }, serving: { label: '250 ml', grams: 250 } });
    expect(milk.barcode).toBe('6221007012345');
    expect(portionItem(milk, unitsFor(milk)[0], 1)).toMatchObject({ name: 'Full cream milk (Juhayna)', quantity: '250 ml', calories: 150, fat: 8 });
    const chips = fromProduct({ code: '6223000000001', name: 'Chipsy', brand: 'Chipsy', per100g: { calories: 530, protein: 6, carbs: 52, fat: 33 }, serving: null });
    expect(unitsFor(chips).map((u) => u.label)).toEqual(['100 g', 'Grams']);
    expect(chips.name).toBe('Chipsy');
  });
});
