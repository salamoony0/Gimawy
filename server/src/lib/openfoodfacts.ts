// Product lookup by barcode in Open Food Facts (free, no key: https://openfoodfacts.github.io/openfoodfacts-server/api/).
// Their API asks for a descriptive User-Agent, which is why lookups go through the server instead of the browser.

export type Macros = { calories: number; protein: number; carbs: number; fat: number };

export type Product = {
  code: string;
  name: string;
  brand: string | null;
  /** Nutrition per 100 g (or 100 ml). Null when the product has no usable nutrition facts. */
  per100g: Macros | null;
  /** One serving as printed on the pack, e.g. { label: "30 g", grams: 30 }. */
  serving: { label: string; grams: number } | null;
};

type OffNutriments = Record<string, number | string | undefined>;
type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
};

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Maps an Open Food Facts product to our shape. Energy falls back to kJ ÷ 4.184 when kcal is missing. */
export function mapProduct(code: string, p: OffProduct): Product | null {
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== null ? num(n['energy_100g'])! / 4.184 : null);
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  const per100g =
    kcal === null && protein === null && carbs === null && fat === null
      ? null
      : { calories: Math.round(kcal ?? 0), protein: round1(protein ?? 0), carbs: round1(carbs ?? 0), fat: round1(fat ?? 0) };
  const grams = num(p.serving_quantity);
  return {
    code,
    name: name.slice(0, 120),
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || null,
    per100g,
    serving: grams && grams > 0 ? { label: (p.serving_size || `${grams} g`).slice(0, 40), grams } : null,
  };
}

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; product: Product | null }>();

/** Looks a barcode up (cached for a day, including misses). Throws on network/upstream failure. */
export async function lookupBarcode(code: string): Promise<Product | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.product;

  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Gymawy/1.0 (fitness tracker; https://github.com/salamoony0/Gimawy)' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status !== 200 && res.status !== 404) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { status?: number; product?: OffProduct };
  const product = body.status === 1 && body.product ? mapProduct(code, body.product) : null;

  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  cache.set(code, { at: Date.now(), product });
  return product;
}

const searchCache = new Map<string, { at: number; products: Product[] }>();
/** Upstream searches per minute for the whole server (Open Food Facts is a free service; be polite). */
const SEARCH_PER_MINUTE = 30;
let windowStart = 0;
let windowCount = 0;

/** Packaged products matching a name (Open Food Facts search, cached a day). Throws when unreachable or busy. */
export async function searchProducts(query: string): Promise<Product[]> {
  const key = query.trim().toLowerCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.products;

  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    windowCount = 0;
  }
  if (++windowCount > SEARCH_PER_MINUTE) throw new Error('Too many product searches right now');

  const params = new URLSearchParams({
    q: query,
    page_size: '20',
    fields: 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments',
  });
  const res = await fetch(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { 'User-Agent': 'Gymawy/1.0 (fitness tracker; https://github.com/salamoony0/Gimawy)' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Open Food Facts search answered ${res.status}`);
  const body = (await res.json()) as { hits?: (OffProduct & { code?: string })[] };
  const products = (body.hits ?? [])
    .filter((h) => /^\d{8,14}$/.test(String(h.code ?? '')))
    .map((h) => mapProduct(String(h.code), h))
    .filter((p): p is Product => p !== null && p.per100g !== null);

  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(key, { at: Date.now(), products });
  return products;
}
