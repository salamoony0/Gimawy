// Local Postgres without Docker: real Postgres binaries from the embedded-postgres package.
// Used by `npm run db` (dev), the API tests and the E2E suite.
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export const DEV_PORT = 5433;

export const pgUrl = (port, database) => `postgresql://postgres:postgres@localhost:${port}/${database}`;

/** A free TCP port, so throwaway clusters never collide with each other or a leftover one. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Starts a cluster in `dir` (created on first use) and makes sure `databases` exist.
 * Without `dir` it uses a fresh temp directory that is deleted on stop().
 */
export async function startPostgres({ port, dir, databases = [], log = false }) {
  const persistent = Boolean(dir);
  const databaseDir = dir ?? mkdtempSync(join(tmpdir(), 'gymawy-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent,
    onLog: log ? (m) => process.stdout.write(`[postgres] ${m}`) : () => {},
    onError: (e) => console.error('[postgres]', e),
  });
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  for (const name of databases) {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  }
  await client.end();
  return pg;
}
