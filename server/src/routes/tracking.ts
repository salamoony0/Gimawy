import { Router } from 'express';
import { z } from 'zod';
import { prisma, HttpError, zDay, param, todayFromQuery, weekStart, round1 } from '../lib/core.js';
import { loadTraining } from '../lib/training.js';

export const trackingRouter = Router();

// ---------- cardio ----------

const CARDIO_TYPES = ['run', 'walk', 'incline', 'cycle', 'row', 'swim', 'elliptical', 'stairs', 'hiit', 'other'] as const;

const cardioInput = z.object({
  type: z.enum(CARDIO_TYPES),
  date: zDay,
  durationMin: z.number().positive().max(1440),
  distanceKm: z.number().min(0).max(1000).nullable().optional(),
  calories: z.number().int().min(0).max(20000).nullable().optional(),
  avgHeartRate: z.number().int().min(30).max(240).nullable().optional(),
  inclinePct: z.number().min(0).max(40).nullable().optional(),
  speedKmh: z.number().min(0).max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

trackingRouter.get('/cardio', async (req, res) => {
  const sessions = await prisma.cardioSession.findMany({
    where: { userId: req.userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(sessions);
});

trackingRouter.post('/cardio', async (req, res) => {
  const body = cardioInput.parse(req.body);
  const s = await prisma.cardioSession.create({ data: { ...body, userId: req.userId } });
  res.status(201).json(s);
});

trackingRouter.patch('/cardio/:id', async (req, res) => {
  const body = cardioInput.partial().parse(req.body);
  const { count } = await prisma.cardioSession.updateMany({ where: { id: param(req, 'id'), userId: req.userId }, data: body });
  if (!count) throw new HttpError(404, 'Session not found');
  res.json(await prisma.cardioSession.findUnique({ where: { id: param(req, 'id') } }));
});

trackingRouter.delete('/cardio/:id', async (req, res) => {
  const { count } = await prisma.cardioSession.deleteMany({ where: { id: param(req, 'id'), userId: req.userId } });
  if (!count) throw new HttpError(404, 'Session not found');
  res.status(204).end();
});

// ---------- body weight ----------

trackingRouter.get('/body', async (req, res) => {
  const entries = await prisma.bodyWeight.findMany({ where: { userId: req.userId }, orderBy: { date: 'asc' } });
  res.json(entries);
});

/** One weigh-in per day: logging again on the same day replaces it. */
trackingRouter.put('/body/:date', async (req, res) => {
  const date = zDay.parse(param(req, 'date'));
  const body = z
    .object({ weightKg: z.number().min(20).max(400), bodyFatPct: z.number().min(2).max(70).nullable().optional() })
    .parse(req.body);
  const entry = await prisma.bodyWeight.upsert({
    where: { userId_date: { userId: req.userId, date } },
    create: { userId: req.userId, date, ...body },
    update: body,
  });
  res.json(entry);
});

trackingRouter.delete('/body/:date', async (req, res) => {
  await prisma.bodyWeight.deleteMany({ where: { userId: req.userId, date: param(req, 'date') } });
  res.status(204).end();
});

// ---------- goals ----------

trackingRouter.get('/goals', async (req, res) => {
  const today = todayFromQuery(req);
  const [goals, latestWeight, training, cardio] = await Promise.all([
    prisma.goal.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      include: { exercise: { select: { name: true } } },
    }),
    prisma.bodyWeight.findFirst({ where: { userId: req.userId }, orderBy: { date: 'desc' } }),
    loadTraining(req.userId),
    prisma.cardioSession.findMany({ where: { userId: req.userId, date: { gte: weekStart(today) } } }),
  ]);

  const bestE1rm = new Map<string, number>();
  for (const w of training)
    for (const e of w.exercises) bestE1rm.set(e.exerciseId, Math.max(bestE1rm.get(e.exerciseId) ?? 0, e.bestE1rm));
  const cardioThisWeek = cardio.reduce((n, s) => n + s.durationMin, 0);

  res.json(
    goals.map((g) => {
      let current: number | null = null;
      if (g.type === 'weight') current = latestWeight?.weightKg ?? null;
      if (g.type === 'lift' && g.exerciseId) current = bestE1rm.get(g.exerciseId) ?? 0;
      if (g.type === 'cardio') current = cardioThisWeek;

      const start = g.type === 'cardio' ? 0 : (g.startValue ?? current ?? 0);
      let progress = 0;
      if (current !== null) {
        const span = g.targetValue - start;
        progress = span === 0 ? 1 : (current - start) / span;
      }
      return {
        id: g.id,
        type: g.type,
        title: g.title,
        exerciseId: g.exerciseId,
        exerciseName: g.exercise?.name ?? null,
        targetValue: g.targetValue,
        startValue: start,
        current: current === null ? null : round1(current),
        deadline: g.deadline,
        progress: Math.max(0, Math.min(1, progress)),
        createdAt: g.createdAt,
      };
    }),
  );
});

trackingRouter.post('/goals', async (req, res) => {
  const body = z
    .object({
      type: z.enum(['weight', 'lift', 'cardio']),
      title: z.string().trim().min(1).max(80),
      exerciseId: z.string().nullable().optional(),
      targetValue: z.number().positive().max(10000),
      deadline: zDay.nullable().optional(),
    })
    .parse(req.body);
  if (body.type === 'lift' && !body.exerciseId) throw new HttpError(400, 'Pick an exercise for a lift goal');

  // Snapshot where the user is starting from, so progress has a baseline.
  let startValue: number | null = null;
  if (body.type === 'weight') {
    const latest = await prisma.bodyWeight.findFirst({ where: { userId: req.userId }, orderBy: { date: 'desc' } });
    startValue = latest?.weightKg ?? null;
  } else if (body.type === 'lift') {
    const training = await loadTraining(req.userId);
    startValue = training
      .flatMap((w) => w.exercises)
      .filter((e) => e.exerciseId === body.exerciseId)
      .reduce((m, e) => Math.max(m, e.bestE1rm), 0);
  }

  const goal = await prisma.goal.create({
    data: { ...body, exerciseId: body.type === 'lift' ? body.exerciseId : null, startValue, userId: req.userId },
  });
  res.status(201).json(goal);
});

trackingRouter.patch('/goals/:id', async (req, res) => {
  const body = z
    .object({
      title: z.string().trim().min(1).max(80),
      targetValue: z.number().positive().max(10000),
      deadline: zDay.nullable(),
    })
    .partial()
    .parse(req.body);
  const { count } = await prisma.goal.updateMany({ where: { id: param(req, 'id'), userId: req.userId }, data: body });
  if (!count) throw new HttpError(404, 'Goal not found');
  res.json(await prisma.goal.findUnique({ where: { id: param(req, 'id') } }));
});

trackingRouter.delete('/goals/:id', async (req, res) => {
  const { count } = await prisma.goal.deleteMany({ where: { id: param(req, 'id'), userId: req.userId } });
  if (!count) throw new HttpError(404, 'Goal not found');
  res.status(204).end();
});

// ---------- food ----------

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const foodItem = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(60).nullable().optional(),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
});

trackingRouter.get('/food', async (req, res) => {
  const date = zDay.parse(req.query.date);
  const entries = await prisma.foodEntry.findMany({
    where: { userId: req.userId, date },
    orderBy: { createdAt: 'asc' },
  });
  res.json(entries);
});

/** Daily calorie/macro totals for a date range (inclusive). */
trackingRouter.get('/food/summary', async (req, res) => {
  const from = zDay.parse(req.query.from);
  const to = zDay.parse(req.query.to);
  const rows = await prisma.foodEntry.groupBy({
    by: ['date'],
    where: { userId: req.userId, date: { gte: from, lte: to } },
    _sum: { calories: true, protein: true, carbs: true, fat: true },
    orderBy: { date: 'asc' },
  });
  res.json(
    rows.map((r) => ({
      date: r.date,
      calories: Math.round(r._sum.calories ?? 0),
      protein: Math.round(r._sum.protein ?? 0),
      carbs: Math.round(r._sum.carbs ?? 0),
      fat: Math.round(r._sum.fat ?? 0),
    })),
  );
});

/** Recently logged foods, de-duplicated, for one-tap re-logging. */
trackingRouter.get('/food/recent', async (req, res) => {
  const entries = await prisma.foodEntry.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const seen = new Map<string, (typeof entries)[number] & { count: number }>();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    const hit = seen.get(key);
    if (hit) hit.count++;
    else seen.set(key, { ...e, count: 1 });
  }
  res.json(
    [...seen.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map(({ name, quantity, calories, protein, carbs, fat, count }) => ({
        name,
        quantity,
        calories,
        protein,
        carbs,
        fat,
        count,
      })),
  );
});

trackingRouter.post('/food', async (req, res) => {
  const body = z
    .object({
      date: zDay,
      meal: z.enum(MEALS),
      source: z.enum(['manual', 'label', 'screenshot', 'photo', 'text']).default('manual'),
      items: z.array(foodItem).min(1).max(30),
    })
    .parse(req.body);
  await prisma.foodEntry.createMany({
    data: body.items.map((i) => ({
      ...i,
      quantity: i.quantity ?? null,
      userId: req.userId,
      date: body.date,
      meal: body.meal,
      source: body.source,
    })),
  });
  res.status(201).json({ created: body.items.length });
});

trackingRouter.patch('/food/:id', async (req, res) => {
  const body = foodItem
    .partial()
    .extend({ meal: z.enum(MEALS).optional(), date: zDay.optional() })
    .parse(req.body);
  const { count } = await prisma.foodEntry.updateMany({ where: { id: param(req, 'id'), userId: req.userId }, data: body });
  if (!count) throw new HttpError(404, 'Entry not found');
  res.json(await prisma.foodEntry.findUnique({ where: { id: param(req, 'id') } }));
});

trackingRouter.delete('/food/:id', async (req, res) => {
  const { count } = await prisma.foodEntry.deleteMany({ where: { id: param(req, 'id'), userId: req.userId } });
  if (!count) throw new HttpError(404, 'Entry not found');
  res.status(204).end();
});
