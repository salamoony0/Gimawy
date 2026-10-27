import { Router } from 'express';
import { prisma, todayFromQuery, addDays, weekStart, round1 } from '../lib/core.js';
import { loadTraining, summarize, type AnnotatedWorkout } from '../lib/training.js';
import { withTrend } from '../lib/trend.js';

export const statsRouter = Router();

function weeklyBuckets(from: string, to: string) {
  const weeks: string[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

function prsFrom(training: AnnotatedWorkout[]) {
  return training.flatMap((w) =>
    w.exercises.flatMap((e) =>
      e.sets
        .filter((s) => s.isPr)
        .map((s) => ({
          date: w.date,
          workoutId: w.id,
          exerciseId: e.exerciseId,
          exercise: e.name,
          weightKg: s.weightKg,
          reps: s.reps,
          e1rm: s.e1rm,
        })),
    ),
  );
}

statsRouter.get('/dashboard', async (req, res) => {
  const today = todayFromQuery(req);
  const thisWeek = weekStart(today);
  const heatFrom = addDays(thisWeek, -7 * 17); // 18 weeks including this one

  const [user, training, cardio, weights, food] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.userId } }),
    loadTraining(req.userId),
    prisma.cardioSession.findMany({ where: { userId: req.userId }, orderBy: { date: 'asc' } }),
    prisma.bodyWeight.findMany({ where: { userId: req.userId }, orderBy: { date: 'asc' } }),
    prisma.foodEntry.findMany({ where: { userId: req.userId, date: { gte: addDays(today, -6), lte: today } } }),
  ]);

  // Activity heatmap
  const days = new Map<string, { strength: number; cardio: number; volume: number; minutes: number }>();
  for (let d = heatFrom; d <= addDays(thisWeek, 6); d = addDays(d, 1))
    days.set(d, { strength: 0, cardio: 0, volume: 0, minutes: 0 });
  for (const w of training) {
    const d = days.get(w.date);
    if (d) {
      d.strength++;
      d.volume += w.volume;
      d.minutes += w.durationMin ?? 0;
    }
  }
  for (const c of cardio) {
    const d = days.get(c.date);
    if (d) {
      d.cardio++;
      d.minutes += c.durationMin;
    }
  }
  const heatmap = [...days.entries()].map(([date, d]) => ({
    date,
    ...d,
    minutes: Math.round(d.minutes),
    future: date > today,
    level: d.strength + d.cardio === 0 ? 0 : Math.min(4, 1 + Math.floor(d.minutes / 30)),
  }));

  // Week streak: consecutive weeks with any session, counting back from this week
  // (the current week doesn't break the streak until it's over).
  const activeWeeks = new Set([...training.map((w) => weekStart(w.date)), ...cardio.map((c) => weekStart(c.date))]);
  let streak = 0;
  let cursor = activeWeeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (activeWeeks.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }

  const inWeek = (date: string, start: string) => date >= start && date <= addDays(start, 6);
  const lastWeek = addDays(thisWeek, -7);
  const volumeOf = (start: string) =>
    training.filter((w) => inWeek(w.date, start)).reduce((n, w) => n + w.volume, 0);

  const weeklyVolume = weeklyBuckets(addDays(thisWeek, -7 * 7), thisWeek).map((week) => {
    const ws = training.filter((w) => inWeek(w.date, week));
    return {
      week,
      volume: ws.reduce((n, w) => n + w.volume, 0),
      sets: ws.reduce((n, w) => n + w.setCount, 0),
      sessions: ws.length,
    };
  });

  const calories7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const entries = food.filter((f) => f.date === date);
    return {
      date,
      calories: Math.round(entries.reduce((n, f) => n + f.calories, 0)),
      protein: Math.round(entries.reduce((n, f) => n + f.protein, 0)),
    };
  });
  const todayFood = food.filter((f) => f.date === today);
  const sum = (k: 'calories' | 'protein' | 'carbs' | 'fat') => Math.round(todayFood.reduce((n, f) => n + f[k], 0));

  const recentWeights = weights.filter((w) => w.date >= addDays(today, -89));
  const trend = withTrend(weights).filter((w) => w.date >= addDays(today, -89));
  const latest = weights.at(-1) ?? null;
  const monthAgo = [...weights].reverse().find((w) => w.date <= addDays(today, -30));

  res.json({
    today,
    user: { name: user.name },
    targets: {
      calories: user.calorieTarget,
      protein: user.proteinTarget,
      carbs: user.carbsTarget,
      fat: user.fatTarget,
      weeklyWorkouts: user.weeklyWorkoutTarget,
    },
    nutrition: { calories: sum('calories'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), items: todayFood.length },
    burnedToday:
      training.filter((w) => w.date === today).reduce((n, w) => n + (w.calories ?? 0), 0) +
      cardio.filter((c) => c.date === today).reduce((n, c) => n + (c.calories ?? 0), 0),
    week: {
      workouts: training.filter((w) => inWeek(w.date, thisWeek)).length,
      cardioMinutes: Math.round(cardio.filter((c) => inWeek(c.date, thisWeek)).reduce((n, c) => n + c.durationMin, 0)),
      volume: volumeOf(thisWeek),
      lastWeekVolume: volumeOf(lastWeek),
      caloriesBurned:
        training.filter((w) => inWeek(w.date, thisWeek)).reduce((n, w) => n + (w.calories ?? 0), 0) +
        cardio.filter((c) => inWeek(c.date, thisWeek)).reduce((n, c) => n + (c.calories ?? 0), 0),
    },
    streak,
    heatmap,
    weeklyVolume,
    calories7,
    weight: {
      latest,
      change30: latest && monthAgo ? round1(latest.weightKg - monthAgo.weightKg) : null,
      entries: trend,
      count: recentWeights.length,
    },
    recentWorkouts: training.slice(-3).reverse().map(summarize),
    recentPrs: prsFrom(training).slice(-6).reverse(),
    totals: { workouts: training.length, cardio: cardio.length },
  });
});

statsRouter.get('/progress', async (req, res) => {
  const today = todayFromQuery(req);
  const rangeDays = { '30': 30, '90': 90, '365': 365 }[String(req.query.range)] ?? null;

  const [user, allTraining, allCardio, weights, foodDays] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.userId } }),
    loadTraining(req.userId),
    prisma.cardioSession.findMany({ where: { userId: req.userId }, orderBy: { date: 'asc' } }),
    prisma.bodyWeight.findMany({ where: { userId: req.userId }, orderBy: { date: 'asc' } }),
    prisma.foodEntry.groupBy({
      by: ['date'],
      where: { userId: req.userId },
      _sum: { calories: true, protein: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const earliest = [allTraining[0]?.date, allCardio[0]?.date, weights[0]?.date].filter(Boolean).sort()[0] ?? today;
  const from = rangeDays ? addDays(today, -(rangeDays - 1)) : earliest;
  const training = allTraining.filter((w) => w.date >= from && w.date <= today);
  const cardio = allCardio.filter((c) => c.date >= from && c.date <= today);
  const weeks = weeklyBuckets(from, today);
  const inWeek = (date: string, start: string) => date >= start && date <= addDays(start, 6);

  // Sets per muscle group
  const muscleSets = new Map<string, number>();
  for (const w of training)
    for (const e of w.exercises)
      muscleSets.set(e.muscleGroup, (muscleSets.get(e.muscleGroup) ?? 0) + e.sets.filter((s) => !s.isWarmup).length);
  const muscleSplit = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core'].map((m) => ({
    muscle: m,
    sets: muscleSets.get(m) ?? 0,
  }));

  // Strength curves for the most-trained exercises
  const freq = new Map<string, { name: string; count: number }>();
  for (const w of training)
    for (const e of w.exercises) {
      const f = freq.get(e.exerciseId) ?? { name: e.name, count: 0 };
      f.count++;
      freq.set(e.exerciseId, f);
    }
  const topLifts = [...freq.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([exerciseId, { name, count }]) => {
      const points = training.flatMap((w) =>
        w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => ({ date: w.date, e1rm: e.bestE1rm })),
      );
      const first = points[0]?.e1rm ?? 0;
      const best = Math.max(...points.map((p) => p.e1rm));
      return { exerciseId, name, sessions: count, points, best, change: round1(best - first) };
    });

  const weekly = weeks.map((week) => {
    const ws = training.filter((w) => inWeek(w.date, week));
    const cs = cardio.filter((c) => inWeek(c.date, week));
    return {
      week,
      volume: ws.reduce((n, w) => n + w.volume, 0),
      sets: ws.reduce((n, w) => n + w.setCount, 0),
      workouts: ws.length,
      cardioMinutes: Math.round(cs.reduce((n, c) => n + c.durationMin, 0)),
      distanceKm: round1(cs.reduce((n, c) => n + (c.distanceKm ?? 0), 0)),
    };
  });

  const typeMap = new Map<string, { minutes: number; sessions: number; distanceKm: number }>();
  for (const c of cardio) {
    const t = typeMap.get(c.type) ?? { minutes: 0, sessions: 0, distanceKm: 0 };
    t.minutes += c.durationMin;
    t.sessions++;
    t.distanceKm += c.distanceKm ?? 0;
    typeMap.set(c.type, t);
  }
  const cardioByType = [...typeMap.entries()]
    .map(([type, t]) => ({ type, minutes: Math.round(t.minutes), sessions: t.sessions, distanceKm: round1(t.distanceKm) }))
    .sort((a, b) => b.minutes - a.minutes);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({
    day,
    strength: training.filter((w) => (new Date(`${w.date}T00:00:00Z`).getUTCDay() + 6) % 7 === i).length,
    cardio: cardio.filter((c) => (new Date(`${c.date}T00:00:00Z`).getUTCDay() + 6) % 7 === i).length,
  }));

  const food = foodDays.filter((d) => d.date >= from && d.date <= today);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const onTarget = food.filter((d) => Math.abs((d._sum.calories ?? 0) - user.calorieTarget) <= user.calorieTarget * 0.1);
  const proteinHit = food.filter((d) => (d._sum.protein ?? 0) >= user.proteinTarget * 0.9);

  const prs = prsFrom(training);
  const rangeWeights = withTrend(weights).filter((w) => w.date >= from && w.date <= today);

  res.json({
    from,
    to: today,
    totals: {
      workouts: training.length,
      volume: training.reduce((n, w) => n + w.volume, 0),
      sets: training.reduce((n, w) => n + w.setCount, 0),
      hours: round1(training.reduce((n, w) => n + (w.durationMin ?? 0), 0) / 60),
      prs: prs.length,
      cardioSessions: cardio.length,
      cardioMinutes: Math.round(cardio.reduce((n, c) => n + c.durationMin, 0)),
      distanceKm: round1(cardio.reduce((n, c) => n + (c.distanceKm ?? 0), 0)),
      caloriesBurned:
        training.reduce((n, w) => n + (w.calories ?? 0), 0) + cardio.reduce((n, c) => n + (c.calories ?? 0), 0),
    },
    weekly,
    muscleSplit,
    topLifts,
    cardioByType,
    weekdays,
    nutrition: {
      daysLogged: food.length,
      avgCalories: avg(food.map((d) => d._sum.calories ?? 0)),
      avgProtein: avg(food.map((d) => d._sum.protein ?? 0)),
      calorieAdherence: food.length ? onTarget.length / food.length : 0,
      proteinAdherence: food.length ? proteinHit.length / food.length : 0,
      targetCalories: user.calorieTarget,
      targetProtein: user.proteinTarget,
    },
    weight: {
      entries: rangeWeights,
      change: rangeWeights.length > 1 ? round1(rangeWeights.at(-1)!.trendKg - rangeWeights[0].trendKg) : null,
    },
    prs: prs.slice(-10).reverse(),
  });
});
