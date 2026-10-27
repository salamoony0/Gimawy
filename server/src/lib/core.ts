import { PrismaClient } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

export const prisma = new PrismaClient();

export const isProd = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set (see server/.env.example)');

// ---------- errors ----------

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: `${issue.path.join('.') || 'input'}: ${issue.message}` });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}

// ---------- auth ----------

const COOKIE = 'gymawy_token';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/** The shared demo login can't change its password, request resets or be deleted. */
export const DEMO_EMAIL = 'demo@gymawy.app';

// Production runs behind a Vercel rewrite, so the API and client share one site: Lax cookies work, and Safari
// doesn't drop them the way it does third-party cookies.
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: isProd });

/** `tokenVersion` goes into the JWT; bumping it on the user signs out every existing session. */
export function setAuthCookie(res: Response, user: { id: string; tokenVersion: number }) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: THIRTY_DAYS });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, cookieOptions());
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Not signed in');
  let payload: { sub: string; v?: number };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { sub: string; v?: number };
  } catch {
    throw new HttpError(401, 'Session expired');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } });
  if (!user || user.tokenVersion !== (payload.v ?? 0)) throw new HttpError(401, 'Session expired');
  req.userId = payload.sub;
  next();
}

// ---------- validation ----------

export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ---------- dates (YYYY-MM-DD strings, UTC arithmetic) ----------

export function toDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

export function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string) {
  const dow = (toDate(day).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function todayFromQuery(req: Request) {
  const t = req.query.today;
  return typeof t === 'string' && zDay.safeParse(t).success ? t : toDay(new Date());
}

// ---------- training math ----------

/** Epley estimated one-rep max. */
export function e1rm(weightKg: number, reps: number) {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
