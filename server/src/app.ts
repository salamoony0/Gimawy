import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, requireAuth, isProd } from './lib/core.js';
import { aiLimiter, apiLimiter } from './lib/limits.js';
import { authRouter } from './routes/auth.js';
import { trainingRouter } from './routes/training.js';
import { trackingRouter } from './routes/tracking.js';
import { statsRouter } from './routes/stats.js';
import { aiRouter } from './routes/ai.js';

export const app = express();

// Production traffic arrives through Vercel's rewrite and then Render's proxy. TRUST_PROXY sets how many hops to
// trust for req.ip (rate-limit keys); default 1 in production.
const hops = process.env.TRUST_PROXY ?? (isProd ? '1' : '');
if (hops) app.set('trust proxy', Number(hops));
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
// Only needed when the client calls the API cross-origin (VITE_API_URL); same-origin setups ignore it.
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? false, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
app.use('/api/stats', requireAuth, apiLimiter, statsRouter);
app.use('/api/ai', requireAuth, apiLimiter, aiRouter);
app.use('/api', requireAuth, apiLimiter, trainingRouter, trackingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);
