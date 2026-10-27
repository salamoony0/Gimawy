// `npm run db`: the local development Postgres on :5433, data kept in server/.postgres (gitignored).
// Only needed when server/.env points DATABASE_URL at localhost:5433 (the default from .env.example).
import { fileURLToPath } from 'node:url';
import { DEV_PORT, pgUrl, startPostgres } from './postgres.mjs';

const dir = fileURLToPath(new URL('../server/.postgres', import.meta.url));
const pg = await startPostgres({ port: DEV_PORT, dir, databases: ['gymawy'] });
console.log(`Postgres ready: ${pgUrl(DEV_PORT, 'gymawy')}`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await pg.stop();
    process.exit(0);
  });
}
setInterval(() => {}, 1 << 30); // stay alive until a signal arrives
