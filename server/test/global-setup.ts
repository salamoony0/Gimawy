import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';
import { freePort, pgUrl, startPostgres } from '../../scripts/postgres.mjs';
import { TEST_ENV } from './env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Every run gets an empty database: a throwaway local Postgres on a free port (deleted afterwards), or
 * TEST_DATABASE_URL if set (it must point at an empty database or schema). Migrations are applied first.
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let pg: Awaited<ReturnType<typeof startPostgres>> | null = null;
  if (!url) {
    const port = await freePort();
    pg = await startPostgres({ port, databases: ['gymawy_test'] });
    url = pgUrl(port, 'gymawy_test');
  }
  execSync('npx prisma migrate deploy', { env: { ...process.env, ...TEST_ENV, DATABASE_URL: url, DIRECT_URL: url }, stdio: 'pipe' });
  project.provide('databaseUrl', url);
  return async () => {
    await pg?.stop();
  };
}
