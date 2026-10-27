// Fresh E2E database: delete the throwaway SQLite file, create the schema, seed the library + demo account.
// Runs as part of the API webServer command so it finishes before the server starts.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const server = new URL('../../server/', import.meta.url);
for (const suffix of ['', '-journal']) rmSync(new URL(`prisma/e2e.db${suffix}`, server), { force: true });
const opts = { cwd: server, stdio: 'inherit', env: { ...process.env, DATABASE_URL: 'file:./e2e.db' } };
execSync('npx prisma db push --skip-generate', opts);
execSync('npm run seed', opts);
