import type { BarcodeProduct, CustomFood, DbFood, FoodItem } from './api';

type Macros = { calories: number; protein: number; carbs: number; fat: number };

/** Anything picked from food search, reduced to one shape: nutrition for a base serving plus other weighed servings. */
export type Pickable = {
  key: string;
  /** Name as logged, with the brand or chain appended when the name doesn't already say it. */
  name: string;
  brand: string | null;
  /** Shown under the name, e.g. "Estimate" or "Open Food Facts". */
  note: string | null;
  base: Macros & { label: string; grams: number | null };
  servings: { label: string; grams: number }[];
  barcode: string | null;
};

/** One choice in the amount picker: a serving (amount = how many) or grams (amount = weight). */
export type Unit = { label: string; grams: number | null; kind: 'serving' | 'grams'; servingLabel?: string };

const withBrand = (name: string, brand: string | null) =>
  brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name;

const NOTE: Record<DbFood['source'], string | null> = { usda: null, published: null, estimate: 'Estimate', off: 'Open Food Facts' };

export function fromDbFood(f: DbFood): Pickable {
  return {
    key: f.id,
    name: withBrand(f.name, f.brand),
    brand: f.brand,
    note: NOTE[f.source],
    base: { label: f.serving, grams: f.grams, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat },
    servings: f.servings ?? [],
    barcode: null,
  };
}

export function fromCustom(f: CustomFood): Pickable {
  return {
    key: `custom-${f.id}`,
    name: f.name,
    brand: null,
    note: 'My food',
    base: { label: f.serving, grams: f.grams, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat },
    servings: [],
    barcode: null,
  };
}

export function fromMine(i: FoodItem): Pickable {
  return {
    key: `mine-${i.name}`,
    name: i.name,
    brand: null,
    note: 'Logged before',
    base: { label: i.quantity || '1 serving', grams: null, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat },
    servings: [],
    barcode: null,
  };
}

export function fromProduct(p: BarcodeProduct): Pickable {
  const per100 = p.per100g!;
  const base = p.serving ?? { label: '100 g', grams: 100 };
  const k = base.grams / 100;
  return {
    key: `off-${p.code}`,
    name: withBrand(p.name, p.brand),
    brand: p.brand,
    note: 'Open Food Facts',
    base: { label: base.label, grams: base.grams, ...scale(per100, k) },
    servings: p.serving ? [{ label: '100 g', grams: 100 }] : [],
    barcode: p.code,
  };
}

/** The amount choices: the base serving, other servings and (when the weight is known) grams. */
export function unitsFor(food: Pickable): Unit[] {
  const known = food.base.grams !== null;
  const servingUnit = (label: string, grams: number | null): Unit => ({
    label: grams !== null && !/\d\s*(g|ml)\b/i.test(label) ? `${label} (${round(grams)} g)` : label,
    grams,
    kind: 'serving',
    servingLabel: label,
  });
  return [
    servingUnit(food.base.label, food.base.grams),
    ...food.servings.map((s) => servingUnit(s.label, s.grams)),
    ...(known ? [{ label: 'Grams', grams: 1, kind: 'grams' as const }] : []),
  ];
}

/** The entry to log for `amount` of `unit`. */
export function portionItem(food: Pickable, unit: Unit, amount: number): FoodItem {
  const factor = unit.grams !== null && food.base.grams ? (amount * unit.grams) / food.base.grams : amount;
  const quantity =
    unit.kind === 'grams' ? `${round(amount)} g` : amount === 1 ? unit.servingLabel! : `${round(amount)} × ${unit.servingLabel}`;
  return { name: food.name, quantity: quantity.slice(0, 60), ...scale(food.base, factor) };
}

const round = (n: number) => Math.round(n * 100) / 100;

function scale(m: Macros, k: number): Macros {
  const r1 = (n: number) => Math.round(n * k * 10) / 10;
  return { calories: Math.round(m.calories * k), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) };
}
