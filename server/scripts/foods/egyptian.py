"""Egyptian dishes, breads, cheeses, sweets and drinks → prisma/foods/egyptian.json.

Values are per 100 g, estimated from typical home/street recipes (USDA ingredients, Egyptian NNI food composition
tables where known). They are marked source "estimate" in the app. Servings are common Egyptian portions.
Run: python3 -I server/scripts/foods/egyptian.py
"""
import json
from pathlib import Path

# (key, English name, Arabic name, extra search words, kcal, protein, carbs, fat, [(serving label, grams), ...])
D = [
    # --- street food & mains
    ('koshari', 'Koshari', 'كشري', 'koshary kushari', 165, 5.5, 28, 3.8, [('Small plate', 300), ('Medium plate', 450), ('Large plate', 600)]),
    ('ful-oil', 'Ful medames with oil', 'فول مدمس بالزيت', 'foul fool beans', 135, 7, 15, 5.5, [('1 plate', 200), ('1 small plate', 120)]),
    ('ful-sandwich', 'Ful sandwich (baladi bread)', 'ساندوتش فول', 'foul sandwich', 194, 8, 30, 5, [('1 sandwich', 170)]),
    ('taameya', "Ta'ameya (Egyptian falafel)", 'طعمية', 'taamia falafel tamiya', 333, 13.3, 31.8, 17.8, [('1 piece', 20), ('5 pieces', 100)]),
    ('taameya-sandwich', "Ta'ameya sandwich", 'ساندوتش طعمية', 'taamia falafel sandwich', 247, 8, 30, 11, [('1 sandwich', 170)]),
    ('potato-sandwich', 'Fried potato sandwich', 'ساندوتش بطاطس', 'batates', 260, 4.5, 36, 11, [('1 sandwich', 170)]),
    ('liver-sandwich', 'Alexandrian liver sandwich', 'ساندوتش كبدة اسكندراني', 'kebda', 210, 13, 20, 8.5, [('1 sandwich', 180)]),
    ('sausage-sandwich', "Sogo' (sausage) sandwich", 'ساندوتش سجق', 'sogo sausage', 270, 11, 21, 16, [('1 sandwich', 180)]),
    ('shawarma-chicken', 'Chicken shawarma sandwich', 'ساندوتش شاورما فراخ', 'shawerma', 215, 13, 20, 9, [('1 sandwich', 250)]),
    ('shawarma-beef', 'Beef shawarma sandwich', 'ساندوتش شاورما لحمة', 'shawerma meat', 240, 13, 18, 13, [('1 sandwich', 250)]),
    ('shawarma-plate', 'Chicken shawarma plate', 'طبق شاورما فراخ', 'shawerma fatta', 190, 13, 15, 8.5, [('1 plate', 400)]),
    ('hawawshi', 'Hawawshi', 'حواوشي', 'hawawshy', 285, 12, 24, 16, [('1 loaf', 220), ('1/2 loaf', 110)]),
    ('kofta', 'Kofta, grilled', 'كفتة مشوية', 'kufta', 250, 18, 4, 18, [('1 skewer', 60), ('1 portion (4 skewers)', 240)]),
    ('kebab', 'Kebab, grilled', 'كباب', 'kabab', 230, 26, 0, 14, [('1 portion', 200), ('1/4 kg', 250)]),
    ('grilled-chicken', 'Grilled chicken (half)', 'نص فرخة مشوية', 'farkha mashwiya', 215, 26, 1, 12, [('1/2 chicken', 350), ('1/4 chicken', 175)]),
    ('fatta', 'Fatta with meat', 'فتة باللحمة', 'fattah', 210, 10, 20, 10, [('1 plate', 400)]),
    ('macarona-bechamel', 'Macarona bechamel', 'مكرونة بشاميل', 'bechamel pasta', 200, 8.5, 18, 10.5, [('1 piece', 250)]),
    ('mahshi-vine', 'Mahshi vine leaves', 'محشي ورق عنب', 'warak enab dolma', 180, 3, 25, 7.5, [('1 piece', 15), ('1 plate', 200)]),
    ('mahshi-cabbage', 'Mahshi cabbage', 'محشي كرنب', 'koronb', 150, 3, 22, 5.5, [('1 roll', 30), ('1 plate', 250)]),
    ('mahshi-mixed', 'Mahshi zucchini, peppers & eggplant', 'محشي كوسة وفلفل وباذنجان', 'kousa', 125, 3, 18, 4.5, [('1 piece', 90), ('1 plate (4 pieces)', 360)]),
    ('molokhia', 'Molokhia', 'ملوخية', 'mloukhia mulukhiyah', 60, 3, 4, 3.5, [('1 bowl', 250)]),
    ('bamya', 'Bamya with meat', 'بامية باللحمة', 'okra stew', 105, 7, 7, 5.5, [('1 plate', 300)]),
    ('torly', 'Torly (vegetable stew)', 'تورلي', 'turli', 85, 3.5, 8, 4.5, [('1 plate', 300)]),
    ('potato-tray', 'Potatoes with meat (oven tray)', 'صينية بطاطس باللحمة', 'batates bel lahma', 120, 6.5, 9, 6.5, [('1 plate', 300)]),
    ('green-beans-meat', 'Green beans with meat', 'فاصوليا خضراء باللحمة', 'fasolia', 90, 6, 6, 4.5, [('1 plate', 300)]),
    ('peas-carrots', 'Peas & carrots with meat', 'بسلة بالجزر', 'bisella', 110, 7, 9, 5, [('1 plate', 300)]),
    ('moussaka', 'Egyptian moussaka (mesa\'a\'a)', 'مسقعة', 'msa2a3a musaqqa', 120, 2, 9, 8.5, [('1 plate', 250)]),
    ('besara', 'Besara', 'بصارة', 'bissara', 115, 6, 14, 4, [('1 bowl', 250)]),
    ('lentil-soup', 'Lentil soup', 'شوربة عدس', 'shorbet ads', 70, 4, 10, 1.8, [('1 bowl', 300)]),
    ('rice-vermicelli', 'Egyptian rice with vermicelli', 'أرز بالشعرية', 'roz', 165, 3, 29, 4.2, [('1 cup', 160), ('1 plate', 250)]),
    ('mombar', 'Mombar', 'ممبار', 'mumbar', 230, 7, 25, 11, [('1 portion', 150)]),
    ('hamam-mahshi', 'Stuffed pigeon', 'حمام محشي', 'hamam', 230, 15, 15, 12.5, [('1 pigeon', 300)]),
    ('sayadeya', 'Sayadeya (fish with rice)', 'صيادية', 'sayadiyah', 160, 9, 20, 4.5, [('1 plate', 400)]),
    ('fried-fish', 'Fried fish (bolti)', 'سمك مقلي', 'tilapia bolti', 210, 20, 6, 11.5, [('1 fish', 250)]),
    ('shrimp-rice', 'Shrimp with rice (seafood plate)', 'جمبري بالأرز', 'gambari', 150, 10, 20, 3, [('1 plate', 400)]),
    ('rokak', 'Rokak with minced meat', 'رقاق باللحمة', 'roqaq', 280, 11, 25, 15, [('1 piece', 150)]),
    ('sambousek', 'Sambousek with cheese', 'سمبوسك جبنة', 'sambosa', 300, 9, 28, 17, [('1 piece', 40)]),
    ('feteer', 'Feteer meshaltet (plain)', 'فطير مشلتت', 'fetir', 420, 7, 42, 25, [('1 slice (1/8)', 60), ('Whole pie', 500)]),
    ('feteer-cheese', 'Feteer with cheese', 'فطير بالجبنة', 'fetir', 330, 10, 32, 18, [('1 slice', 80), ('Whole', 450)]),
    ('shakshuka', 'Shakshuka', 'شكشوكة', 'eggs tomato', 120, 6.5, 5, 8.5, [('1 plate', 250)]),
    ('eggah', 'Eggah (Egyptian omelette)', 'عجة', 'egga', 190, 9, 6, 14.5, [('1 piece', 120)]),
    ('eggs-pastrami', 'Eggs with pastrami', 'بيض بالبسطرمة', 'basterma', 230, 15, 2, 18, [('1 plate (2 eggs)', 150)]),
    # --- salads & sides
    ('baba-ghanoug', 'Baba ghanoug', 'بابا غنوج', 'baba ganoush', 120, 2.5, 7, 9.5, [('2 tbsp', 30), ('1 bowl', 150)]),
    ('tahina-salad', 'Tahina salad', 'سلطة طحينة', 'tahini dip', 270, 7.5, 9, 23, [('2 tbsp', 30), ('1 small bowl', 100)]),
    ('green-salad', 'Egyptian green salad', 'سلطة خضراء', 'salata baladi', 35, 1, 5, 1.5, [('1 bowl', 150)]),
    ('torshi', 'Torshi (pickles)', 'طرشي', 'mekhalel pickles', 25, 1, 4, 0.3, [('1 side', 50)]),
    ('termis-salted', 'Termis, salted (lupini)', 'ترمس', 'lupini', 119, 15.6, 9.9, 2.9, [('1 cup', 166), ('1 small bag', 100)]),
    # --- breads & cheeses
    ('aish-baladi', 'Aish baladi (Egyptian bread)', 'عيش بلدي', 'eish bread baladi', 250, 9, 52, 1.2, [('1 loaf', 90), ('1/2 loaf', 45)]),
    ('aish-fino', 'Fino bread roll', 'عيش فينو', 'fino', 280, 9, 55, 2.5, [('1 roll', 60)]),
    ('aish-shamy', 'Aish shamy (white pita)', 'عيش شامي', 'shami', 275, 9.1, 55.7, 1.2, [('1 loaf', 60)]),
    ('simit', 'Simit (sesame ring)', 'سميط', 'semit', 300, 10, 55, 4.5, [('1 ring', 100)]),
    ('gebna-domiati', 'Domiati cheese (white)', 'جبنة دمياطي', 'gebna beda white cheese', 270, 15, 2, 22, [('1 slice', 30), ('100 g', 100)]),
    ('gebna-rumi', 'Rumi cheese', 'جبنة رومي', 'romy', 390, 28, 1, 31, [('1 slice', 25)]),
    ('gebna-areesh', 'Areesh cheese', 'جبنة قريش', 'qareesh cottage', 95, 13, 3.5, 3, [('1 portion', 100)]),
    ('labneh', 'Labneh', 'لبنة', 'labna', 180, 6, 4, 15, [('2 tbsp', 30)]),
    ('mesh', 'Mesh (aged cheese)', 'مش', 'mish', 210, 14, 4, 15, [('1 tbsp', 15)]),
    # --- sweets
    ('om-ali', 'Om Ali', 'أم علي', 'umm ali', 260, 6, 28, 14, [('1 bowl', 250)]),
    ('basbousa', 'Basbousa', 'بسبوسة', 'basbosa', 380, 5, 57, 15, [('1 piece', 70)]),
    ('konafa', 'Konafa', 'كنافة', 'kunafa knafeh', 420, 6, 50, 22, [('1 piece', 120)]),
    ('rice-pudding-eg', 'Roz bel laban (rice pudding)', 'أرز باللبن', 'rice milk', 135, 3.5, 22, 3.5, [('1 bowl', 200)]),
    ('mahalabeya', 'Mahalabeya', 'مهلبية', 'muhallabia', 125, 3.5, 20, 3.3, [('1 bowl', 180)]),
    ('kahk', 'Kahk', 'كحك', 'kaak eid cookie', 480, 6, 58, 25, [('1 piece', 35)]),
    ('ghorayeba', 'Ghorayeba', 'غريبة', 'ghraybeh', 520, 6, 55, 31, [('1 piece', 25)]),
    ('petit-four', 'Petit four', 'بيتي فور', 'betefour', 490, 6, 60, 25, [('1 piece', 12)]),
    ('qatayef', 'Qatayef with nuts', 'قطايف', 'atayef', 350, 6, 45, 16, [('1 piece', 60)]),
    ('zalabya', 'Zalabya (lokma)', 'زلابية', 'lokma luqaimat', 380, 4, 55, 16, [('5 pieces', 75)]),
    ('meshabek', 'Meshabek', 'مشبك', 'mushabak', 420, 3, 65, 17, [('1 piece', 40)]),
    ('halawa', 'Halawa tahiniya', 'حلاوة طحينية', 'halva halwa', 520, 12, 52, 30, [('1 tbsp', 20), ('1 piece', 50)]),
    ('feteer-honey', 'Feteer with honey', 'فطير بالعسل', 'fetir asal', 430, 6, 50, 23, [('1 slice', 80)]),
    # --- drinks
    ('sugarcane', 'Sugarcane juice', 'عصير قصب', 'asab', 73, 0.2, 18, 0, [('1 cup', 300)]),
    ('karkade', 'Karkade (hibiscus), sweetened', 'كركديه', 'karkadeh hibiscus', 40, 0, 10, 0, [('1 cup', 250)]),
    ('sobia', 'Sobia', 'سوبيا', 'sobya', 110, 1.5, 20, 2.5, [('1 cup', 300)]),
    ('sahlab', 'Sahlab', 'سحلب', 'sahlep salep', 95, 3, 14, 3, [('1 cup', 250)]),
    ('tamr-hindi', 'Tamr hindi', 'تمر هندي', 'tamarind', 60, 0.2, 15, 0, [('1 cup', 300)]),
    ('lemon-juice', 'Fresh lemon juice, sweetened', 'عصير ليمون', 'lemonade lamoon', 50, 0.2, 12.5, 0, [('1 cup', 250)]),
    ('tea-sugar', 'Tea with 2 spoons sugar', 'شاي بسكر', 'shay', 20, 0, 5, 0, [('1 cup', 200)]),
    ('tea-milk', 'Tea with milk & sugar', 'شاي بلبن', 'shay bel laban', 45, 1.3, 7, 1.3, [('1 cup', 250)]),
    ('turkish-coffee', 'Turkish coffee, medium sugar', 'قهوة تركي مظبوط', 'ahwa mazboot', 42, 0.2, 10, 0.1, [('1 cup', 60)]),
    ('hummus-sham', 'Hummus el sham (hot chickpea drink)', 'حمص الشام', 'homs elsham', 90, 4, 13, 2.5, [('1 cup', 250)]),
]

out = []
for key, name, ar, words, kcal, p, c, f, servings in D:
    assert abs(kcal - (4 * p + 4 * c + 9 * f)) / kcal < 0.25 or kcal < 60, (key, kcal, 4 * p + 4 * c + 9 * f)
    out.append({
        'key': f'eg-{key}', 'name': name, 'nameAr': ar, 'aliases': words, 'kind': 'egyptian', 'source': 'estimate',
        'per100g': {'calories': kcal, 'protein': p, 'carbs': c, 'fat': f},
        'servings': [{'label': l, 'grams': g} for l, g in servings],
    })

dest = Path(__file__).resolve().parents[2] / 'prisma' / 'foods' / 'egyptian.json'
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'dishes →', dest)
