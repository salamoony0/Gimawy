// Popular packaged products sold in Egypt, from Open Food Facts → prisma/foods/brands.json.
// Data © Open Food Facts contributors, ODbL (https://opendatacommons.org/licenses/odbl/1-0/); brands.json is shared
// under the same licence. Only products with complete per-100 g macros that roughly add up (4/4/9) are kept.
// Run: node server/scripts/foods/brands.mjs   (about 2 minutes; it waits between requests)
import { writeFileSync } from 'node:fs';

const BRANDS = [
  // Egyptian
  'Juhayna', 'Domty', 'Edita', 'Molto', 'Chipsy', 'Bisco Misr', 'Corona', 'Beyti', 'Lamar', 'Labanita', 'Panda',
  'Almarai', 'El Rashidi El Mizan', 'Abu Auf', 'Faragello', 'Halwani', 'Americana', 'Koki', 'Regina', 'El Maleka',
  'Dina Farms', 'Obour Land', 'Teama', 'Isis', 'Vitrac', 'Best', 'Tiger', 'Todo', 'Big Chips', 'Hohos', 'Twinkies',
  // international, common in Egypt
  "Lay's", 'Doritos', 'Pringles', 'Pepsi', 'Coca-Cola', 'Schweppes', 'Spiro Spathis', 'Red Bull', 'Nestlé', 'Nescafé',
  'Nesquik', 'Kit Kat', 'Galaxy', 'Cadbury', 'Snickers', 'Mars', 'Twix', 'Nutella', 'Kinder', 'Oreo',
  'Activia', 'Danone', 'Président', 'La Vache qui rit', 'Kiri', 'Heinz', "Hellmann's", 'Quaker', "Kellogg's",
  'Indomie', 'Fitness',
];
// Names other companies also use: only products tagged as sold in Egypt.
const EGYPT_ONLY = new Set(['Best', 'Corona', 'Tiger', 'Panda', 'Isis', 'Koki', 'Molto', 'Todo', 'Teama', 'Big Chips', 'Fitness']);
const PER_BRAND = 15;
const UA = 'Gymawy/1.0 (fitness tracker; https://github.com/salamoony0/Gimawy)';
const FIELDS = 'code,product_name,product_name_en,product_name_ar,brands,serving_size,serving_quantity,nutriments';
const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = [];
const seen = new Set();
for (const brand of BRANDS) {
  let hits = [];
  try {
    const filter = EGYPT_ONLY.has(brand) ? ' AND countries_tags:"en:egypt"' : '';
    const q = new URLSearchParams({ q: `brands:"${brand}"${filter}`, sort_by: '-unique_scans_n', page_size: '60', fields: FIELDS });
    const res = await fetch(`https://search.openfoodfacts.org/search?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
    hits = (await res.json()).hits ?? [];
  } catch (e) {
    console.log('skip', brand, e.message);
  }
  let kept = 0;
  for (const h of hits) {
    const n = h.nutriments ?? {};
    let kcal = num(n['energy-kcal_100g']);
    if (kcal === null && num(n['energy_100g']) !== null) kcal = num(n['energy_100g']) / 4.184;
    const [p, c, f] = [num(n.proteins_100g), num(n.carbohydrates_100g), num(n.fat_100g)];
    const ar = (h.product_name_ar ?? '').trim() || null;
    const name = (h.product_name_en || h.product_name || '').trim() || ar;
    const code = String(h.code ?? '');
    if ([kcal, p, c, f].includes(null) || !name || !/^\d{8,14}$/.test(code)) continue;
    if (kcal > 950 || p + c + f > 101) continue;
    if (kcal > 40 && Math.abs(kcal - (4 * p + 4 * c + 9 * f)) / kcal > 0.3) continue;
    const dedupe = `${brand.toLowerCase()}|${name.toLowerCase().replace(/\W+/g, ' ').trim()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const g = num(h.serving_quantity);
    out.push({
      key: `off-${code}`,
      name: name.slice(0, 120),
      nameAr: ar && ar !== name ? ar : null,
      brand,
      kind: 'brand',
      source: 'off',
      barcode: code,
      per100g: { calories: Math.round(kcal), protein: round1(p), carbs: round1(c), fat: round1(f) },
      servings: g && g > 0 && g <= 1000 ? [{ label: String(h.serving_size || `${g} g`).slice(0, 40), grams: round1(g) }] : [],
    });
    if (++kept === PER_BRAND) break;
  }
  console.log(`${brand}: ${kept}`);
  await sleep(1500);
}
const dest = new URL('../../prisma/foods/brands.json', import.meta.url);
writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(out.length, 'products →', dest.pathname);
