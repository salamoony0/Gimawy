import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TEST_ENV } from './env.js';

/** Starts every run from an empty test database (a throwaway SQLite file next to schema.prisma). */
export default function setup() {
  for (const suffix of ['', '-journal']) {
    rmSync(fileURLToPath(new URL(`../prisma/test.db${suffix}`, import.meta.url)), { force: true });
  }
  execSync('npx prisma db push --skip-generate', { env: { ...process.env, ...TEST_ENV }, stdio: 'pipe' });
}
