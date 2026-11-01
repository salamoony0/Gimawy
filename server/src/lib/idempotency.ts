import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError, prisma } from './core.js';

const KEEP_DAYS = 30;
/** A first request that never finished (crash, dropped connection) stops blocking its key after this long. */
const STALE_MS = 60_000;

/**
 * POSTs sent with an `Idempotency-Key` header (the offline outbox) are answered once: the first response is stored
 * per user and key, and a repeat gets it back without writing again. A failed first attempt (4xx/5xx) frees the key
 * so the retry runs for real. A repeat that arrives while the first is still running gets 409 and is retried later.
 * Mounted after requireAuth.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.get('Idempotency-Key');
  if (req.method !== 'POST' || !key) return next();
  if (key.length > 100) throw new HttpError(400, 'Idempotency-Key is too long');
  const where = { userId_key: { userId: req.userId, key } };

  if (!(await claim(req.userId, key))) {
    const row = await prisma.idempotencyKey.findUnique({ where });
    if (row?.status != null) return void (row.body === null ? res.status(row.status).end() : res.status(row.status).json(row.body));
    if (row && Date.now() - row.createdAt.getTime() < STALE_MS) throw new HttpError(409, 'This entry is still being saved');
    await prisma.idempotencyKey.deleteMany({ where: { userId: req.userId, key } });
    if (!(await claim(req.userId, key))) throw new HttpError(409, 'This entry is still being saved');
  }

  // The answer is stored before it is sent, so a replay that follows straight after always finds it.
  let recorded = false;
  const record = (body: unknown) => {
    recorded = true;
    return (
      res.statusCode < 400
        ? prisma.idempotencyKey.update({ where, data: { status: res.statusCode, body: body === undefined ? Prisma.JsonNull : (body as Prisma.InputJsonValue) } })
        : prisma.idempotencyKey.delete({ where })
    ).catch((err) => console.error('idempotency key bookkeeping failed', err));
  };
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    void record(body).then(() => json(body));
    return res;
  };
  // Responses sent without a JSON body (e.g. 204) are recorded once they're out.
  res.on('finish', () => !recorded && void record(undefined));
  next();
}

/** Inserts the key; false when this user already has it. Old keys are pruned on the way. */
async function claim(userId: string, key: string) {
  void prisma.idempotencyKey
    .deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } })
    .catch(() => {});
  try {
    await prisma.idempotencyKey.create({ data: { userId, key } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}
