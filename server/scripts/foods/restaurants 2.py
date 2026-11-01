"""Restaurant items → prisma/foods/restaurants.json (per item, no weights).

Global chains: the chain's published nutrition (US/UK menus; Egyptian recipes and sizes can differ), source
"published". Egyptian chains don't publish nutrition, so their items are estimated from similar items and typical
recipes, source "estimate". Run: python3 -I server/scripts/foods/restaurants.py
"""
import json, re
from pathlib import Path

# chain → (Arabic name, source, [(item, serving label, kcal, protein, carbs, fat), ...])
R = {
    "McDonald's": ('ماكدونالدز', 'published', [
        ('Big Mac', '1 burger', 590, 25, 46, 34),
        ('Quarter Pounder with Cheese (McRoyale)', '1 burger', 520, 30, 42, 26),
        ('Double Quarter Pounder with Cheese', '1 burger', 740, 48, 43, 42),
        ('Cheeseburger', '1 burger', 300, 15, 32, 13),
        ('Double Cheeseburger', '1 burger', 450, 25, 34, 24),
        ('Hamburger', '1 burger', 250, 12, 31, 9),
        ('McChicken', '1 sandwich', 400, 14, 39, 21),
        ('Filet-O-Fish', '1 sandwich', 390, 16, 39, 19),
        ('Chicken McNuggets, 6 pieces', '6 pieces', 250, 14, 15, 15),
        ('Chicken McNuggets, 9 pieces', '9 pieces', 380, 21, 22, 23),
        ('Chicken McNuggets, 20 pieces', '20 pieces', 830, 46, 49, 49),
        ('French fries, small', '1 small', 230, 3, 31, 11),
        ('French fries, medium', '1 medium', 320, 5, 43, 15),
        ('French fries, large', '1 large', 480, 7, 65, 23),
        ('Egg McMuffin', '1 sandwich', 310, 17, 30, 13),
        ('Hash brown', '1 piece', 140, 1, 16, 8),
        ('McFlurry with Oreo, regular', '1 regular', 510, 12, 80, 16),
        ('Apple pie', '1 pie', 230, 2, 33, 11),
        ('Vanilla cone', '1 cone', 200, 5, 32, 5),
        ('Coca-Cola, medium', '1 medium', 200, 0, 55, 0),
    ]),
    'KFC': ('كنتاكي', 'published', [
        ('Original Recipe chicken breast', '1 piece', 390, 39, 11, 21),
        ('Original Recipe thigh', '1 piece', 280, 19, 8, 19),
        ('Original Recipe drumstick', '1 piece', 130, 12, 4, 8),
        ('Original Recipe wing', '1 piece', 130, 10, 3, 8),
        ('Spicy crispy chicken breast', '1 piece', 530, 35, 18, 35),
        ('Zinger sandwich', '1 sandwich', 450, 28, 44, 18),
        ('Coleslaw', '1 regular', 170, 1, 14, 12),
        ('Mashed potato with gravy', '1 regular', 130, 2, 18, 5),
        ('Fries, regular', '1 regular', 250, 3, 33, 12),
    ]),
    'KFC Egypt (estimated)': ('كنتاكي مصر', 'estimate', [
        ('Mighty Zinger', '1 sandwich', 720, 42, 56, 36),
        ('Twister', '1 wrap', 500, 22, 50, 23),
        ('Rizo', '1 regular', 450, 18, 60, 15),
        ('Popcorn chicken, regular', '1 regular', 290, 17, 16, 18),
    ]),
    'Burger King': ('برجر كينج', 'published', [
        ('Whopper', '1 burger', 660, 28, 49, 40),
        ('Whopper with cheese', '1 burger', 740, 32, 50, 46),
        ('Double Whopper', '1 burger', 900, 48, 49, 58),
        ('Whopper Jr.', '1 burger', 330, 14, 27, 19),
        ('Chicken Royale', '1 sandwich', 610, 25, 52, 33),
        ('Chicken nuggets, 8 pieces', '8 pieces', 380, 18, 22, 24),
        ('French fries, medium', '1 medium', 370, 4, 53, 15),
        ('Onion rings, medium', '1 medium', 410, 6, 50, 21),
    ]),
    "Hardee's (estimated)": ('هارديز', 'estimate', [
        ('Super Star burger', '1 burger', 790, 37, 49, 49),
        ('Famous Star burger', '1 burger', 580, 24, 48, 32),
        ('Mushroom & Swiss burger', '1 burger', 670, 37, 46, 38),
        ('Chicken fillet sandwich', '1 sandwich', 520, 28, 53, 22),
        ('Curly fries, medium', '1 medium', 410, 5, 46, 23),
    ]),
    'Pizza Hut': ('بيتزا هت', 'published', [
        ('Pepperoni pan pizza, medium', '1 slice', 250, 10, 26, 12),
        ('Cheese pan pizza, medium', '1 slice', 240, 10, 27, 10),
        ('Supreme pan pizza, medium', '1 slice', 280, 11, 27, 14),
        ('Margherita thin crust, medium', '1 slice', 190, 8, 22, 8),
    ]),
    "Domino's": ('دومينوز', 'published', [
        ('Cheese pizza, hand tossed, medium', '1 slice', 210, 8, 26, 8),
        ('Pepperoni pizza, hand tossed, medium', '1 slice', 240, 9, 26, 11),
    ]),
    "Papa John's": ('بابا جونز', 'published', [
        ('Cheese pizza, original crust, large', '1 slice', 280, 11, 35, 10),
        ('Pepperoni pizza, original crust, large', '1 slice', 310, 12, 35, 13),
        ('Garlic sauce', '1 cup', 150, 0, 0, 17),
    ]),
    'Subway': ('صب واي', 'published', [
        ('Sweet onion chicken teriyaki, 6-inch', '1 sub', 330, 25, 49, 5),
        ('Turkey breast, 6-inch', '1 sub', 270, 18, 40, 4),
        ('Oven roasted chicken, 6-inch', '1 sub', 310, 23, 40, 6),
        ('Tuna, 6-inch', '1 sub', 470, 20, 39, 25),
        ('Italian B.M.T., 6-inch', '1 sub', 390, 19, 41, 16),
        ('Steak & cheese, 6-inch', '1 sub', 340, 23, 40, 10),
    ]),
    'Starbucks': ('ستاربكس', 'published', [
        ('Caffè latte, grande', '1 grande', 190, 13, 19, 7),
        ('Cappuccino, grande', '1 grande', 140, 9, 14, 5),
        ('Caramel macchiato, grande', '1 grande', 250, 10, 35, 7),
        ('Caffè mocha with whip, grande', '1 grande', 370, 14, 43, 16),
        ('White chocolate mocha with whip, grande', '1 grande', 430, 15, 53, 18),
        ('Caramel Frappuccino, grande', '1 grande', 380, 4, 57, 16),
        ('Java Chip Frappuccino, grande', '1 grande', 440, 6, 66, 18),
        ('Caffè Americano, grande', '1 grande', 15, 1, 2, 0),
        ('Butter croissant', '1 croissant', 260, 5, 28, 14),
    ]),
    'Costa Coffee (estimated)': ('كوستا', 'estimate', [
        ('Latte, medium', '1 medium', 170, 11, 17, 6),
        ('Cappuccino, medium', '1 medium', 120, 8, 12, 4.5),
        ('Flat white', '1 cup', 110, 7, 10, 4.5),
        ('Iced latte, medium', '1 medium', 130, 8, 13, 5),
    ]),
    'Cook Door (estimated)': ('كوك دور', 'estimate', [
        ('Beef burger', '1 sandwich', 520, 26, 45, 26),
        ('Crispy chicken sandwich', '1 sandwich', 560, 24, 55, 27),
        ('Chicken shawarma sandwich', '1 sandwich', 450, 26, 45, 18),
        ('Hot dog', '1 sandwich', 380, 12, 38, 20),
        ('Fries, regular', '1 regular', 330, 4, 42, 16),
    ]),
    "Mo'men (estimated)": ('مؤمن', 'estimate', [
        ("Mo'men beef burger", '1 sandwich', 540, 27, 45, 28),
        ('Double beef burger', '1 sandwich', 780, 40, 48, 46),
        ('Crispy chicken sandwich', '1 sandwich', 560, 24, 55, 27),
        ('Fries, regular', '1 regular', 330, 4, 42, 16),
    ]),
    'Gad (estimated)': ('جاد', 'estimate', [
        ('Ful sandwich', '1 sandwich', 300, 11, 45, 8),
        ("Ta'ameya sandwich", '1 sandwich', 380, 10, 48, 16),
        ('Alexandrian liver sandwich', '1 sandwich', 420, 20, 45, 17),
        ("Sogo' sandwich", '1 sandwich', 480, 18, 45, 25),
        ('Chicken shawarma sandwich', '1 sandwich', 430, 24, 45, 17),
        ('Fried potato sandwich', '1 sandwich', 450, 7, 60, 20),
        ('Egg sandwich', '1 sandwich', 380, 14, 45, 16),
        ('Luncheon fino sandwich', '1 sandwich', 380, 13, 45, 16),
    ]),
    'Abou Tarek (estimated)': ('أبو طارق', 'estimate', [
        ('Koshari, small', '1 small', 495, 17, 84, 11),
        ('Koshari, medium', '1 medium', 740, 25, 126, 17),
        ('Koshari, large', '1 large', 990, 33, 168, 23),
    ]),
    'Koshary El Tahrir (estimated)': ('كشري التحرير', 'estimate', [
        ('Koshari, small', '1 small', 495, 17, 84, 11),
        ('Koshari, medium', '1 medium', 740, 25, 126, 17),
        ('Koshari, large', '1 large', 990, 33, 168, 23),
    ]),
    'Zooba (estimated)': ('زووبا', 'estimate', [
        ("Ta'ameya sandwich", '1 sandwich', 350, 10, 45, 14),
        ('Ful sandwich', '1 sandwich', 330, 12, 45, 11),
        ('Koshari bowl', '1 bowl', 700, 22, 120, 16),
        ('Hawawshi', '1 sandwich', 650, 28, 50, 36),
    ]),
    'Buffalo Burger (estimated)': ('بافلو برجر', 'estimate', [
        ('Classic beef burger', '1 burger', 650, 33, 45, 38),
        ('Double beef burger', '1 burger', 900, 52, 46, 56),
        ('Crispy chicken burger', '1 burger', 640, 28, 56, 33),
        ('Fries, regular', '1 regular', 340, 4, 44, 16),
    ]),
    'Bremer (estimated)': ('بريمر', 'estimate', [
        ('Classic beef burger', '1 burger', 580, 30, 42, 32),
        ('Chicken burger', '1 burger', 560, 27, 52, 27),
    ]),
}

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
out = []
for chain, (ar, source, items) in R.items():
    brand = chain.replace(' (estimated)', '')
    for name, label, kcal, p, c, f in items:
        assert abs(kcal - (4 * p + 4 * c + 9 * f)) / kcal < 0.2 or kcal < 60, (chain, name, kcal, 4 * p + 4 * c + 9 * f)
        out.append({
            'key': f'r-{slug(brand)}-{slug(name)}', 'name': name, 'brand': brand, 'nameAr': ar, 'kind': 'restaurant',
            'source': source, 'serving': {'label': label, 'calories': kcal, 'protein': p, 'carbs': c, 'fat': f},
        })

dest = Path(__file__).resolve().parents[2] / 'prisma' / 'foods' / 'restaurants.json'
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'items →', dest)
