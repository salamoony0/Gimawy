import type { Request } from 'express';
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';

// In-memory counters: fine for a single API instance (Render free tier). Tests can turn them off with
// RATE_LIMIT=off, except the suites that check the limits themselves.
const off = () => process.env.RATE_LIMIT === 'off';
const base: Partial<Options> = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: off,
  message: { error: 'Too many requests. Wait a few minutes and try again.' },
};

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
const email = (req: Request) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '');

/** Brute force on one account: 10 attempts per 15 min per email (falls back to IP). Successful logins don't count. */
export const accountLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${email(req) || ip(req)}`,
});

/** Spraying many accounts from one address. Generous because proxies can make users share an IP. */
export const ipAuthLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 100,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `ip:${ip(req)}`,
});

/** Signed-in API traffic, per user (mounted after requireAuth). */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 300,
  keyGenerator: (req) => `user:${req.userId}`,
});

/** AI scans are slow and cost quota: 10 per minute per user, on top of the daily cap. */
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (req) => `ai:${req.userId}`,
  message: { error: 'Slow down: at most 10 scans a minute.' },
});

/** Reset emails: 5 per hour per address, counted whether or not the account exists (the reply is always 200). */
export const forgotLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 5,
  keyGenerator: (req) => `forgot:${email(req) || ip(req)}`,
});

/** New accounts: 20 per hour per address. */
export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: (req) => `register:${ip(req)}`,
});
