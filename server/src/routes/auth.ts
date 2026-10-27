import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, HttpError, setAuthCookie, clearAuthCookie, requireAuth, zDay } from '../lib/core.js';

export const authRouter = Router();

const publicUser = {
  id: true,
  email: true,
  name: true,
  weightUnit: true,
  distanceUnit: true,
  heightCm: true,
  calorieTarget: true,
  proteinTarget: true,
  carbsTarget: true,
  fatTarget: true,
  weeklyWorkoutTarget: true,
  sex: true,
  birthDate: true,
  activityLevel: true,
  goal: true,
  goalRateKg: true,
  onboarded: true,
  createdAt: true,
} as const;

/** Most recent weigh-in, used client-side for calorie burn estimates. */
async function withLatestWeight<T extends { id: string }>(user: T) {
  const latest = await prisma.bodyWeight.findFirst({ where: { userId: user.id }, orderBy: { date: 'desc' } });
  return { ...user, latestWeightKg: latest?.weightKg ?? null };
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('enter a valid email'),
  password: z.string().min(8, 'must be at least 8 characters'),
});

authRouter.post('/register', async (req, res) => {
  const body = credentials.extend({ name: z.string().trim().min(1, 'required').max(60) }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
    select: publicUser,
  });
  setAuthCookie(res, user.id);
  res.status(201).json(await withLatestWeight(user));
});

authRouter.post('/login', async (req, res) => {
  const body = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  setAuthCookie(res, user.id);
  const { passwordHash: _, ...rest } = user;
  res.json(await withLatestWeight(rest));
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUser });
  if (!user) throw new HttpError(401, 'Account not found');
  res.json(await withLatestWeight(user));
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(60),
      weightUnit: z.enum(['kg', 'lb']),
      distanceUnit: z.enum(['km', 'mi']),
      heightCm: z.number().min(50).max(272).nullable(),
      calorieTarget: z.number().int().min(800).max(10000),
      proteinTarget: z.number().int().min(0).max(1000),
      carbsTarget: z.number().int().min(0).max(1500),
      fatTarget: z.number().int().min(0).max(500),
      weeklyWorkoutTarget: z.number().int().min(1).max(14),
      sex: z.enum(['male', 'female']),
      birthDate: zDay,
      activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
      goal: z.enum(['lose', 'maintain', 'gain']),
      goalRateKg: z.number().min(0).max(1.5),
      onboarded: z.boolean(),
    })
    .partial()
    .parse(req.body);
  const user = await prisma.user.update({ where: { id: req.userId }, data: body, select: publicUser });
  res.json(await withLatestWeight(user));
});
