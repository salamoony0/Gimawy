/**
 * `seed.ts library` adds any missing built-in exercises (idempotent; runs on every deploy).
 * `seed.ts demo` does that and rebuilds a demo account with ~12 weeks of
 * realistic history so every chart has something to show:
 *
 *   demo@gymawy.app / demo1234
 *
 * Other accounts are never touched.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const LIBRARY: Array<[name: string, muscle: string, equipment: string]> = [
  // chest
  ['Bench Press', 'chest', 'barbell'],
  ['Incline Bench Press', 'chest', 'barbell'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['Incline Dumbbell Press', 'chest', 'dumbbell'],
  ['Chest Fly Machine', 'chest', 'machine'],
  ['Cable Crossover', 'chest', 'cable'],
  ['Push-up', 'chest', 'bodyweight'],
  ['Dips', 'chest', 'bodyweight'],
  ['Machine Chest Press', 'chest', 'machine'],
  // back
  ['Deadlift', 'back', 'barbell'],
  ['Barbell Row', 'back', 'barbell'],
  ['Pull-up', 'back', 'bodyweight'],
  ['Chin-up', 'back', 'bodyweight'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Seated Cable Row', 'back', 'cable'],
  ['Dumbbell Row', 'back', 'dumbbell'],
  ['T-Bar Row', 'back', 'barbell'],
  ['Chest-Supported Row', 'back', 'machine'],
  ['Straight-Arm Pulldown', 'back', 'cable'],
  ['Back Extension', 'back', 'bodyweight'],
  // shoulders
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Seated Dumbbell Press', 'shoulders', 'dumbbell'],
  ['Arnold Press', 'shoulders', 'dumbbell'],
  ['Lateral Raise', 'shoulders', 'dumbbell'],
  ['Cable Lateral Raise', 'shoulders', 'cable'],
  ['Rear Delt Fly', 'shoulders', 'dumbbell'],
  ['Face Pull', 'shoulders', 'cable'],
  ['Machine Shoulder Press', 'shoulders', 'machine'],
  ['Upright Row', 'shoulders', 'barbell'],
  // biceps
  ['Barbell Curl', 'biceps', 'barbell'],
  ['Dumbbell Curl', 'biceps', 'dumbbell'],
  ['Hammer Curl', 'biceps', 'dumbbell'],
  ['Incline Dumbbell Curl', 'biceps', 'dumbbell'],
  ['Preacher Curl', 'biceps', 'machine'],
  ['Cable Curl', 'biceps', 'cable'],
  ['EZ-Bar Curl', 'biceps', 'barbell'],
  // triceps
  ['Triceps Pushdown', 'triceps', 'cable'],
  ['Overhead Triceps Extension', 'triceps', 'cable'],
  ['Skull Crusher', 'triceps', 'barbell'],
  ['Close-Grip Bench Press', 'triceps', 'barbell'],
  ['Dumbbell Kickback', 'triceps', 'dumbbell'],
  // legs
  ['Back Squat', 'legs', 'barbell'],
  ['Front Squat', 'legs', 'barbell'],
  ['Leg Press', 'legs', 'machine'],
  ['Hack Squat', 'legs', 'machine'],
  ['Romanian Deadlift', 'legs', 'barbell'],
  ['Bulgarian Split Squat', 'legs', 'dumbbell'],
  ['Walking Lunge', 'legs', 'dumbbell'],
  ['Leg Extension', 'legs', 'machine'],
  ['Lying Leg Curl', 'legs', 'machine'],
  ['Seated Leg Curl', 'legs', 'machine'],
  ['Standing Calf Raise', 'legs', 'machine'],
  ['Seated Calf Raise', 'legs', 'machine'],
  ['Goblet Squat', 'legs', 'dumbbell'],
  // glutes
  ['Hip Thrust', 'glutes', 'barbell'],
  ['Glute Bridge', 'glutes', 'bodyweight'],
  ['Cable Kickback', 'glutes', 'cable'],
  ['Hip Abduction Machine', 'glutes', 'machine'],
  // core
  ['Plank', 'core', 'bodyweight'],
  ['Hanging Leg Raise', 'core', 'bodyweight'],
  ['Cable Crunch', 'core', 'cable'],
  ['Ab Wheel Rollout', 'core', 'other'],
  ['Russian Twist', 'core', 'bodyweight'],
  ['Decline Sit-up', 'core', 'bodyweight'],
  // full body
  ['Kettlebell Swing', 'full body', 'kettlebell'],
  ['Power Clean', 'full body', 'barbell'],
  ['Farmer\'s Carry', 'full body', 'dumbbell'],
  ['Thruster', 'full body', 'barbell'],
  ['Burpee', 'full body', 'bodyweight'],
];

// Deterministic PRNG so the demo data is the same on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

const toDay = (d: Date) => d.toISOString().slice(0, 10);
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

type Plan = { name: string; lifts: Array<[exercise: string, sets: number, reps: number, startKg: number, weeklyGainKg: number]> };

const PLANS: Plan[] = [
  {
    name: 'Push Day',
    lifts: [
      ['Bench Press', 4, 6, 75, 1.25],
      ['Seated Dumbbell Press', 3, 10, 22, 0.5],
      ['Incline Dumbbell Press', 3, 10, 26, 0.5],
      ['Lateral Raise', 4, 14, 10, 0.2],
      ['Triceps Pushdown', 3, 12, 30, 0.6],
    ],
  },
  {
    name: 'Pull Day',
    lifts: [
      ['Deadlift', 3, 5, 120, 2.5],
      ['Lat Pulldown', 4, 10, 60, 1],
      ['Seated Cable Row', 3, 10, 55, 1],
      ['Face Pull', 3, 15, 20, 0.3],
      ['Hammer Curl', 3, 12, 14, 0.3],
    ],
  },
  {
    name: 'Leg Day',
    lifts: [
      ['Back Squat', 4, 6, 95, 2],
      ['Romanian Deadlift', 3, 8, 80, 1.5],
      ['Leg Press', 3, 12, 160, 3],
      ['Lying Leg Curl', 3, 12, 40, 0.6],
      ['Standing Calf Raise', 4, 15, 60, 1],
    ],
  },
  {
    name: 'Upper Body',
    lifts: [
      ['Overhead Press', 4, 6, 47.5, 0.6],
      ['Barbell Row', 4, 8, 70, 1.25],
      ['Dips', 3, 10, 0, 0],
      ['Pull-up', 3, 8, 0, 0],
      ['Barbell Curl', 3, 10, 30, 0.4],
    ],
  },
];

const MEALS = {
  breakfast: [
    { name: 'Greek yogurt with berries', quantity: '250 g', calories: 260, protein: 23, carbs: 30, fat: 5 },
    { name: 'Scrambled eggs', quantity: '3 large', calories: 270, protein: 19, carbs: 2, fat: 20 },
    { name: 'Oatmeal with banana', quantity: '1 bowl', calories: 380, protein: 11, carbs: 68, fat: 7 },
    { name: 'Whole-grain toast', quantity: '2 slices', calories: 200, protein: 8, carbs: 34, fat: 3 },
    { name: 'Protein shake', quantity: '1 scoop + milk', calories: 240, protein: 32, carbs: 14, fat: 6 },
  ],
  lunch: [
    { name: 'Grilled chicken breast', quantity: '200 g', calories: 330, protein: 62, carbs: 0, fat: 7 },
    { name: 'White rice', quantity: '1.5 cups', calories: 310, protein: 6, carbs: 68, fat: 1 },
    { name: 'Chicken shawarma wrap', quantity: '1 wrap', calories: 620, protein: 38, carbs: 55, fat: 26 },
    { name: 'Tuna salad', quantity: '1 bowl', calories: 420, protein: 40, carbs: 12, fat: 23 },
    { name: 'Mixed salad', quantity: '1 bowl', calories: 120, protein: 3, carbs: 12, fat: 7 },
  ],
  dinner: [
    { name: 'Salmon fillet', quantity: '180 g', calories: 370, protein: 40, carbs: 0, fat: 22 },
    { name: 'Lean beef mince', quantity: '200 g', calories: 420, protein: 52, carbs: 0, fat: 23 },
    { name: 'Sweet potato', quantity: '250 g', calories: 215, protein: 4, carbs: 50, fat: 0 },
    { name: 'Pasta bolognese', quantity: '1 plate', calories: 650, protein: 35, carbs: 78, fat: 20 },
    { name: 'Roasted vegetables', quantity: '1 cup', calories: 140, protein: 4, carbs: 18, fat: 6 },
  ],
  snack: [
    { name: 'Protein bar', quantity: '1 bar', calories: 210, protein: 20, carbs: 22, fat: 7 },
    { name: 'Almonds', quantity: '30 g', calories: 175, protein: 6, carbs: 6, fat: 15 },
    { name: 'Apple', quantity: '1 medium', calories: 95, protein: 0, carbs: 25, fat: 0 },
    { name: 'Cottage cheese', quantity: '200 g', calories: 180, protein: 24, carbs: 8, fat: 5 },
    { name: 'Dates', quantity: '4 pieces', calories: 110, protein: 1, carbs: 30, fat: 0 },
  ],
} as const;

async function main(mode: string) {
  if (mode !== 'library' && mode !== 'demo') throw new Error('Usage: seed.ts library|demo');

  // Library
  const byName = new Map<string, string>();
  for (const [name, muscleGroup, equipment] of LIBRARY) {
    const existing = await prisma.exercise.findFirst({ where: { name, userId: null } });
    const ex = existing ?? (await prisma.exercise.create({ data: { name, muscleGroup, equipment } }));
    byName.set(name, ex.id);
  }
  console.log(`Exercise library: ${byName.size} exercises`);
  if (mode === 'library') return;

  // Demo account
  await prisma.user.deleteMany({ where: { email: 'demo@gymawy.app' } });
  const user = await prisma.user.create({
    data: {
      email: 'demo@gymawy.app',
      name: 'Demo Athlete',
      passwordHash: await bcrypt.hash('demo1234', 10),
      heightCm: 180,
      sex: 'male',
      birthDate: '1996-05-14',
      activityLevel: 'moderate',
      goal: 'lose',
      goalRateKg: 0.5,
      onboarded: true,
      calorieTarget: 2000,
      proteinTarget: 150,
      carbsTarget: 220,
      fatTarget: 65,
      weeklyWorkoutTarget: 4,
    },
  });

  const today = toDay(new Date());
  // 12 Monday-aligned weeks, the last one being the current week.
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -dow - 7 * 11);
  const schedule = [0, 1, 3, 4]; // day offsets within each week for the 4-day split

  let session = 0;
  for (let week = 0; week < 12; week++) {
    for (const [i, offset] of schedule.entries()) {
      const date = addDays(start, week * 7 + offset);
      if (date >= today) continue; // leave today for the user to log
      if (week < 11 && rand() < 0.08) continue; // the occasional missed session
      const plan = PLANS[i % PLANS.length];
      const startedAt = new Date(`${date}T${pick(['06', '07', '17', '18', '19'])}:${pick(['05', '20', '35', '50'])}:00Z`);
      const duration = Math.round(between(52, 78));
      // Week 7 is a deload: lighter weights, fewer sets.
      const deload = week === 7;
      await prisma.workout.create({
        data: {
          userId: user.id,
          name: plan.name,
          date,
          startedAt,
          endedAt: new Date(startedAt.getTime() + duration * 60000),
          // Resistance training MET 5.0 × ~82 kg body weight
          calories: Math.round((5 * 3.5 * 82 * duration) / 200),
          exercises: {
            create: plan.lifts.map(([name, sets, reps, startKg, gain], order) => {
              const base = startKg + gain * week * (deload ? 0.6 : 1);
              const weight = startKg === 0 ? 0 : roundTo(base * (deload ? 0.85 : 1), 2.5);
              const setCount = deload ? sets - 1 : sets;
              return {
                exerciseId: byName.get(name)!,
                order,
                sets: {
                  create: [
                    ...(order === 0 && weight > 40
                      ? [{ order: 0, reps: 8, weightKg: roundTo(weight * 0.6, 2.5), isWarmup: true }]
                      : []),
                    ...Array.from({ length: setCount }, (_, s) => ({
                      order: s + 1,
                      reps: Math.max(1, reps + (s === setCount - 1 ? -Math.round(rand() * 2) : 0) + (startKg === 0 ? Math.floor(week / 3) : 0)),
                      weightKg: weight,
                      rpe: order === 0 ? roundTo(between(7, 9), 0.5) : null,
                      isWarmup: false,
                    })),
                  ],
                },
              };
            }),
          },
        },
      });
      session++;
    }
  }
  console.log(`Workouts: ${session}`);

  // Cardio: 2-3 sessions a week
  const cardio = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (![0, 3, 6].includes(dow) || rand() < 0.15) continue;
    const type = pick(['run', 'run', 'cycle', 'walk', 'row', 'stairs', 'incline', 'incline']);
    const durationMin = Math.round(between(20, 50));
    const speed = { run: between(9.5, 11.5), cycle: between(22, 28), walk: between(5.2, 6.2), row: between(11, 13), stairs: 0, incline: between(4.5, 5.6) }[type]!;
    const inclinePct = type === 'incline' ? roundTo(between(8, 15), 0.5) : null;
    cardio.push({
      userId: user.id,
      type,
      date: d,
      durationMin,
      distanceKm: speed ? Math.round(((speed * durationMin) / 60) * 100) / 100 : null,
      calories: Math.round(durationMin * between(8, 12)),
      avgHeartRate: Math.round(between(128, 158)),
      inclinePct,
      speedKmh: type === 'incline' ? Math.round(speed * 10) / 10 : null,
    });
  }
  await prisma.cardioSession.createMany({ data: cardio });
  console.log(`Cardio sessions: ${cardio.length}`);

  // Body weight: steady cut from 84 kg with day-to-day water noise
  const weights = [];
  for (let i = 0, d = start; d <= today; i++, d = addDays(d, 1)) {
    if (rand() < 0.18) continue;
    const trend = 84 - i * 0.042;
    weights.push({ userId: user.id, date: d, weightKg: Math.round((trend + between(-0.6, 0.6)) * 10) / 10 });
  }
  await prisma.bodyWeight.createMany({ data: weights });
  console.log(`Weigh-ins: ${weights.length}`);

  // Food: last 21 days, plus a partial log today
  const food = [];
  for (let i = 20; i >= 0; i--) {
    const date = addDays(today, -i);
    if (i > 0 && rand() < 0.1) continue;
    const meals = i === 0 ? (['breakfast', 'lunch'] as const) : (['breakfast', 'lunch', 'dinner', 'snack'] as const);
    for (const meal of meals) {
      const count = meal === 'snack' ? 1 : 2;
      const options = [...MEALS[meal]];
      for (let k = 0; k < count; k++) {
        const item = options.splice(Math.floor(rand() * options.length), 1)[0];
        food.push({ userId: user.id, date, meal, ...item, source: rand() < 0.4 ? pick(['photo', 'label', 'screenshot']) : 'manual' });
      }
    }
  }
  await prisma.foodEntry.createMany({ data: food });
  console.log(`Food entries: ${food.length}`);

  // Routines mirror the split
  for (const plan of PLANS) {
    await prisma.routine.create({
      data: {
        userId: user.id,
        name: plan.name,
        exercises: {
          create: plan.lifts.map(([name, sets, reps], order) => ({
            exerciseId: byName.get(name)!,
            order,
            targetSets: sets,
            targetReps: reps,
          })),
        },
      },
    });
  }

  await prisma.goal.createMany({
    data: [
      { userId: user.id, type: 'weight', title: 'Cut to 78 kg', targetValue: 78, startValue: 84, deadline: addDays(today, 60) },
      { userId: user.id, type: 'lift', title: 'Bench 120 kg (e1RM)', exerciseId: byName.get('Bench Press')!, targetValue: 120, startValue: 90 },
      { userId: user.id, type: 'lift', title: 'Squat 160 kg (e1RM)', exerciseId: byName.get('Back Squat')!, targetValue: 160, startValue: 114 },
      { userId: user.id, type: 'cardio', title: '150 min cardio / week', targetValue: 150 },
    ],
  });

  console.log('Demo account ready: demo@gymawy.app / demo1234');
}

main(process.argv[2] ?? '')
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
