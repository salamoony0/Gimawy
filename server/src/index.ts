import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { errorHandler, requireAuth, isProd } from './lib/core.js';
import { authRouter } from './routes/auth.js';
import { trainingRouter } from './routes/training.js';
import { trackingRouter } from './routes/tracking.js';
import { statsRouter } from './routes/stats.js';
import { aiRouter } from './routes/ai.js';

const app = express();

if (isProd) app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? false, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api', requireAuth, trainingRouter, trackingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Gymawy API listening on http://localhost:${port}`);
});
