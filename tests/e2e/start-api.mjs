// The E2E API server: a throwaway Postgres on a free port (migrated + seeded with the library and demo account),
// then the dev API with the env from playwright.config.ts. The DB URL is written to tests/e2e/.db-url for specs
// that need to look at the database. Everything is stopped when Playwright sends SIGTERM.
import { execSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { freePort, pgUrl, startPostgres } from '../../scripts/postgres.mjs';

const port = await freePort();
const pg = await startPostgres({ port, databases: ['gymawy_e2e'] });
const url = pgUrl(port, 'gymawy_e2e');
writeFileSync(new URL('.db-url', import.meta.url), url);

const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
const server = new URL('../../server/', import.meta.url);
execSync('npx prisma migrate deploy', { cwd: server, env, stdio: 'inherit' });
execSync('npm run seed', { cwd: server, env, stdio: 'inherit' });

const api = spawn('npm', ['run', 'dev', '-w', 'server'], { env, stdio: 'inherit' });
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  await pg.stop();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
api.on('exit', stop);
