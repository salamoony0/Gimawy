export type Macros = { calories: number; protein: number; carbs: number; fat: number };

/** One entry of prisma/foods/*.json: per 100 g with weighed servings, or a single per-item serving (restaurants). */
export type FoodJson = {
  key: string;
  name: string;
  nameAr?: string | null;
  brand?: string | null;
  aliases?: string;
  kind: string;
  source: string;
  barcode?: string;
  per100g?: Macros;
  servings?: { label: string; grams: number }[];
  serving?: { label: string } & Macros;
};

/**
 * Lower-case, strip accents/diacritics/punctuation and fold Arabic spelling variants (أ إ آ → ا, ة → ه, ى → ي), so
 * "Ta'ameya", "taameya", "طعمية" and "طعميه" all match. Used for both the stored `search` column and the query.
 */
export function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٕـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A JSON food → a Food row: nutrition for the default (first) serving, other weighed servings kept as choices. */
export function toFoodRow(f: FoodJson) {
  const base = {
    id: f.key,
    name: f.name,
    nameAr: f.nameAr ?? null,
    brand: f.brand ?? null,
    kind: f.kind,
    source: f.source,
    barcode: f.barcode ?? null,
    search: normalizeSearch([f.name, f.nameAr, f.brand, f.aliases].filter(Boolean).join(' ')),
  };
  if (f.serving) {
    const { label, ...m } = f.serving;
    return { ...base, serving: label, grams: null, servings: null, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
  }
  const per100 = f.per100g!;
  const [first, ...rest] = f.servings?.length ? f.servings : [{ label: '100 g', grams: 100 }];
  const k = first.grams / 100;
  return {
    ...base,
    serving: first.label,
    grams: first.grams,
    servings: rest.length ? rest : null,
    calories: Math.round(per100.calories * k),
    protein: r1(per100.protein * k),
    carbs: r1(per100.carbs * k),
    fat: r1(per100.fat * k),
  };
}

const KIND_ORDER: Record<string, number> = { generic: 0, egyptian: 0, restaurant: 1, brand: 2 };
/** Someone searching in Arabic most likely means the Egyptian dish (جبنة → Domiati before Parmesan). */
const KIND_ORDER_ARABIC: Record<string, number> = { egyptian: 0, generic: 1, restaurant: 2, brand: 3 };

/**
 * Name (English, Arabic, or "brand name") starts with the query as a word, then as a prefix ("eggplant"), then a
 * later word starts with it; home foods before restaurants before packaged brands (Egyptian dishes first for an Arabic
 * query); then shorter names.
 */
export function rankFoods<T extends { name: string; nameAr?: string | null; brand?: string | null; kind: string }>(rows: T[], query: string) {
  const q = normalizeSearch(query);
  const first = q.split(' ')[0];
  const kindOrder = /[\u0600-\u06FF]/.test(q) ? KIND_ORDER_ARABIC : KIND_ORDER;
  const tier = (text: string) => {
    const n = normalizeSearch(text);
    if (n === q || n.startsWith(`${q} `)) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(' ').some((w) => w.startsWith(first))) return 2;
    return 3;
  };
  const best = (r: T) => Math.min(...[r.name, r.nameAr, r.brand && `${r.brand} ${r.name}`].filter((t): t is string => !!t).map(tier));
  return rows
    .map((r) => ({ r, t: best(r), k: kindOrder[r.kind] ?? 4, l: r.name.length }))
    .sort((a, b) => a.t - b.t || a.k - b.k || a.l - b.l)
    .map((x) => x.r);
}
