import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, HttpError, setAuthCookie, clearAuthCookie, requireAuth, zDay, DEMO_EMAIL } from '../lib/core.js';
import { accountLimiter, forgotLimiter, ipAuthLimiter, registerLimiter } from '../lib/limits.js';
import { appUrl, sendMail } from '../lib/mailer.js';

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

const zEmail = z.string().trim().toLowerCase().email('enter a valid email');
// bcrypt only looks at the first 72 bytes, so cap the length rather than silently ignoring the rest.
const zPassword = z.string().min(8, 'must be at least 8 characters').max(72, 'must be at most 72 characters');
const credentials = z.object({ email: zEmail, password: zPassword });

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const RESET_TTL_MS = 60 * 60_000;
// Compared against when the email is unknown, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function findUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, 'Account not found');
  return user;
}

async function checkPassword(hash: string, password: unknown) {
  if (typeof password !== 'string' || !(await bcrypt.compare(password, hash))) throw new HttpError(403, 'Password is incorrect');
}

function notDemo(email: string) {
  if (email === DEMO_EMAIL) throw new HttpError(403, 'The shared demo account can’t be changed. Create your own account to try this.');
}

authRouter.post('/register', registerLimiter, async (req, res) => {
  const body = credentials.extend({ name: z.string().trim().min(1, 'required').max(60) }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
    select: { ...publicUser, tokenVersion: true },
  });
  setAuthCookie(res, user);
  const { tokenVersion: _, ...rest } = user;
  res.status(201).json(await withLatestWeight(rest));
});

authRouter.post('/login', ipAuthLimiter, accountLimiter, async (req, res) => {
  const body = z.object({ email: zEmail, password: z.string().max(200) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect');
  setAuthCookie(res, user);
  const { passwordHash: _, tokenVersion: __, ...rest } = user;
  res.json(await withLatestWeight(rest));
});

// Always answers 200 so the form can't be used to find out which emails have accounts. The email is sent in the
// background so the response time doesn't depend on whether the account exists.
authRouter.post('/forgot', forgotLimiter, async (req, res) => {
  const { email } = z.object({ email: zEmail }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.email !== DEMO_EMAIL) {
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${appUrl()}/reset?token=${token}`;
    sendMail({
      to: user.email,
      subject: 'Reset your Gymawy password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p><a href="${link}">Choose a new password</a> (valid for 1 hour).</p><p>If you didn't ask for this, you can ignore this email.</p>`,
    }).catch((err) => console.error('Password reset email failed:', (err as Error).message));
  }
  res.json({ ok: true });
});

authRouter.post('/reset', ipAuthLimiter, async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password: zPassword }).parse(req.body);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  }
  // Every other session is signed out; this browser is signed in with the new password.
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await bcrypt.hash(body.password, 10), tokenVersion: { increment: 1 } },
      select: { ...publicUser, tokenVersion: true },
    }),
    prisma.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  setAuthCookie(res, user);
  const { tokenVersion: _, ...rest } = user;
  res.json(await withLatestWeight(rest));
});

authRouter.patch('/password', requireAuth, async (req, res) => {
  const body = z.object({ current: z.string().max(200), next: zPassword }).parse(req.body);
  const user = await findUser(req.userId);
  notDemo(user.email);
  await checkPassword(user.passwordHash, body.current);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.next, 10), tokenVersion: { increment: 1 } },
    select: { id: true, tokenVersion: true },
  });
  setAuthCookie(res, updated);
  res.status(204).end();
});

/** Signs out every device, this one included. */
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { tokenVersion: { increment: 1 } } });
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get('/export', requireAuth, async (req, res) => {
  const userId = req.userId;
  const [user, exercises, workouts, routines, cardio, bodyWeights, goals, foods] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: publicUser }),
    prisma.exercise.findMany({ where: { userId } }),
    prisma.workout.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { exercise: { select: { name: true } }, sets: { orderBy: { order: 'asc' } } },
        },
      },
    }),
    prisma.routine.findMany({
      where: { userId },
      include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: { select: { name: true } } } } },
    }),
    prisma.cardioSession.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.goal.findMany({ where: { userId } }),
    prisma.foodEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="gymawy-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    units: 'Weights in kg, distances in km, durations in minutes.',
    user,
    customExercises: exercises,
    workouts,
    routines,
    cardio,
    bodyWeights,
    goals,
    foods,
  });
});

/** Permanently deletes the account; every row hangs off User with onDelete: Cascade. */
authRouter.delete('/me', requireAuth, async (req, res) => {
  const user = await findUser(req.userId);
  notDemo(user.email);
  await checkPassword(user.passwordHash, req.body?.password);
  await prisma.user.delete({ where: { id: user.id } });
  clearAuthCookie(res);
  res.status(204).end();
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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
