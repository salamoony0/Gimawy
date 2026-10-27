// Runs a shell command with the local dev Postgres available: reuses `npm run db` if it's already running,
// otherwise starts it just for the command. Usage: node scripts/with-db.mjs "<command>"
import { execSync } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { DEV_PORT, startPostgres } from './postgres.mjs';

const running = await new Promise((resolve) => {
  const socket = connect(DEV_PORT, 'localhost', () => resolve(socket.end() && true)).on('error', () => resolve(false));
});
const dir = fileURLToPath(new URL('../server/.postgres', import.meta.url));
const pg = running ? null : await startPostgres({ port: DEV_PORT, dir, databases: ['gymawy'] });
try {
  execSync(process.argv[2], { stdio: 'inherit' });
} finally {
  await pg?.stop();
}
