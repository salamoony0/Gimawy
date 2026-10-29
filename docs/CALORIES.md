# How Gymawy calculates calories

Every formula lives in [`client/src/lib/energy.ts`](../client/src/lib/energy.ts) (tests: `energy.test.ts`). Keep this page in sync with it.

Units: kg, cm, years, minutes. 7,700 kcal ≈ 1 kg of body weight.

## 1. Daily target (setup wizard)

**BMR — Mifflin-St Jeor**

```
BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + s        s = +5 (male), −161 (female)
```

**Maintenance (TDEE)**

```
TDEE = BMR × activity factor
  sedentary 1.2 · light 1.375 · moderate 1.55 · very active 1.725 · athlete 1.9
```

**Goal adjustment**

```
adjustment = ± goal pace (kg/week) × 7,700 ÷ 7        − to lose, + to gain, 0 to maintain
target     = round to 10 ( max(TDEE + adjustment, floor) )
floor      = 1,500 kcal (male) / 1,200 kcal (female)
```

**Macros**

```
protein = 2.2 g/kg when losing, 1.8 g/kg otherwise (max 260 g)
fat     = 25% of calories ÷ 9
carbs   = (calories − protein × 4 − fat × 9) ÷ 4
```

*Example:* male, 30 y, 180 cm, 85 kg, moderately active, losing 0.5 kg/week.
BMR = 850 + 1,125 − 150 + 5 = **1,830**. TDEE = 1,830 × 1.55 = **2,837**. Adjustment = −0.5 × 7,700 ÷ 7 = **−550**.
Target = **2,290 kcal**; protein 187 g, fat 64 g, carbs 242 g.

## 2. Adaptive target (Food → Adaptive target)

The setup formula is an estimate. After a few weeks of logging, Gymawy measures your real maintenance:

```
window          = the 28 days before today (today is usually only half logged)
logged days     = days with food ≥ 40% of your current target (lower = "forgot to log", skipped)
avg intake      = mean calories of the logged days
weight slope    = least-squares line through your weigh-ins in the window (kg/day)
measured TDEE   = avg intake − weight slope × 7,700
ideal target    = max(measured TDEE + goal adjustment, floor), rounded to 10
next target     = current target moved toward the ideal by at most ±250 kcal
macros          = same rules as above, using your latest weigh-in
```

It needs **14+ logged days** and **4+ weigh-ins spread over 14+ days**; until then the card shows progress.
The suggestion is applied when you tap it, or once a week automatically if *Adjust my targets automatically* is on (only when it's at least 50 kcal different).

*Example:* you averaged 2,500 kcal and your weight trend fell 0.5 kg/week (−0.0714 kg/day).
Measured TDEE = 2,500 + 0.0714 × 7,700 = **3,050**. Goal −0.5 kg/week → ideal **2,500**. Current target 2,200 → next target **2,450** (+250 cap).

Why a fitted line and not "last weigh-in − first weigh-in": a single heavy or light morning (water, salt, carbs) can move the scale 1 kg, which would be 7,700 kcal of error. The line uses every weigh-in.

## 3. Calories burned

Body weight = your latest weigh-in (75 kg if you have none). The best available method is used:

**a) Heart rate — Keytel et al. (2005)**, when average HR, age and sex are known:

```
male   kcal/min = (−55.0969 + 0.6309 × HR + 0.1988 × kg + 0.2017 × age) ÷ 4.184
female kcal/min = (−20.4022 + 0.4472 × HR − 0.1263 × kg + 0.0740 × age) ÷ 4.184
```

**b) Speed + incline — ACSM equations**, for walk / run / incline with a speed:

```
speed m/min = km/h × 1000 ÷ 60,   grade = incline % ÷ 100
walking  VO2 = 0.1 × speed + 1.8 × speed × grade + 3.5      (ml O2/kg/min)
running  VO2 = 0.2 × speed + 0.9 × speed × grade + 3.5      (≥ 8 km/h, or "run" above 6.5 km/h)
kcal     = VO2 × kg ÷ 1000 × 5 × minutes                   (≈ 5 kcal per litre of O2)
```

**c) MET** otherwise:

```
kcal = MET × 3.5 × kg × minutes ÷ 200
run 9.8 · walk 3.5 · incline 6.0 · cycle 7.5 · row 7.0 · swim 7.0 · elliptical 5.0 · stairs 9.0 · HIIT 8.0 · other 6.0
strength workouts: MET 5.0 × workout duration
```

*Example:* 30 min incline walk at 5 km/h and 12%, 80 kg → speed 83.3 m/min, VO2 = 8.3 + 18.0 + 3.5 = 29.8 → **358 kcal**.

Burned calories are shown for information only. They are **not** added back to the food budget: the daily target already includes your activity level (and the adaptive target measures it directly).

## 4. Strength numbers

```
e1RM (Epley)  = weight × (1 + reps ÷ 30)        (1 rep = the weight itself)
PR            = a session's best e1RM set that beats every earlier set of that exercise
                (including records entered by hand on Train → Records)
volume        = Σ weight × reps of working sets (warm-ups excluded)
weight trend  = average of the weigh-ins in the trailing 7 calendar days
```
