"""Resolve usda_targets.T against the USDA SR Legacy CSVs (fdc.nal.usda.gov/download-datasets, public domain) → generic.json.
Run: python3 -I server/scripts/foods/usda_build.py <unzipped SR Legacy CSV folder> server/prisma/foods/generic.json"""
import csv, json, re, sys
from pathlib import Path

DATA = Path(sys.argv[1])
OUT = Path(sys.argv[2])
sys.path.insert(0, str(Path(__file__).parent))
from usda_targets import ALIASES, T

foods = {r['fdc_id']: r['description'] for r in csv.DictReader(open(DATA / 'food.csv'))}
want = {'1008': 'calories', '1003': 'protein', '1005': 'carbs', '1004': 'fat'}
nutr = {}
for r in csv.DictReader(open(DATA / 'food_nutrient.csv')):
    k = want.get(r['nutrient_id'])
    if k:
        nutr.setdefault(r['fdc_id'], {})[k] = float(r['amount'])
units = {r['id']: r['name'] for r in csv.DictReader(open(DATA / 'measure_unit.csv'))}
portions = {}
for r in csv.DictReader(open(DATA / 'food_portion.csv')):
    portions.setdefault(r['fdc_id'], []).append(r)

def fmt_amount(a):
    a = float(a or 0)
    if a == 0:
        return ''
    return {0.25: '1/4', 0.5: '1/2', 0.333: '1/3', 0.75: '3/4'}.get(round(a, 3), f'{a:g}')

def label(p):
    unit = units.get(p['measure_unit_id'], '')
    mod = (p['modifier'] or '').strip()
    if unit and unit != 'undetermined':
        text = f"{fmt_amount(p['amount'])} {unit}" + (f", {mod}" if mod else '')
    else:
        text = f"{fmt_amount(p['amount'])} {mod}".strip()
    text = re.sub(r'\s+', ' ', text)
    return text[:40]

out, missing = [], []
for name, ar, pattern in T:
    rx = re.compile(pattern, re.I)
    hits = [(len(d), fid, d) for fid, d in foods.items() if rx.search(d) and fid in nutr and len(nutr[fid]) == 4]
    if not hits:
        missing.append((name, pattern))
        continue
    _, fid, desc = min(hits)
    n = nutr[fid]
    ps = []
    for p in sorted(portions.get(fid, []), key=lambda p: int(p['seq_num'] or 0)):
        g = float(p['gram_weight'] or 0)
        if 0 < g <= 700:
            lab = label(p)
            if lab and lab not in [x['label'] for x in ps]:
                ps.append({'label': lab, 'grams': round(g, 1)})
    # A natural single item first (1 large egg, 1 slice, 1 fillet…), else 1 cup/container, else the USDA order.
    natural = re.compile(r'\b(large|medium|slice|piece|fillet|pita|tortilla|container|can|bar|patty|thigh|date|fruit|cookie|pancake|waffle|croissant|bagel|artichoke|olive|liver|sausage|serving)\b', re.I)
    rank = lambda x: (0 if natural.search(x['label']) and 'cup' not in x['label'] and 'NLEA' not in x['label'] else 1 if x['label'].startswith('1 cup') else 2,
                      0 if 'medium' in x['label'] else 1)
    ps = sorted(ps, key=rank)[:4]
    # Cups make no sense for oils, nuts, meat and cheese: use a tablespoon or 100 g instead.
    if ps and ps[0]['label'].startswith('1 cup'):
        tbsp = next((x for x in ps if 'tbsp' in x['label'] or 'tablespoon' in x['label']), None)
        if n['calories'] > 500 and tbsp:
            ps.remove(tbsp); ps.insert(0, tbsp)
        elif n['protein'] > 12 or n['calories'] > 450:
            ps.insert(0, {'label': '100 g', 'grams': 100})
    out.append({
        'key': f'usda-{fid}', 'name': name, 'nameAr': ar, 'aliases': ALIASES.get(name, ''), 'kind': 'generic', 'source': 'usda', 'usda': desc,
        'per100g': {k: round(n[k], 1) if k != 'calories' else round(n[k]) for k in ('calories', 'protein', 'carbs', 'fat')},
        'servings': ps,
    })

json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f'{len(out)} resolved, {len(missing)} missing')
for m in missing:
    print('MISSING', m)
