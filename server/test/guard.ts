// API tests create and delete accounts, so they must only ever reach the throwaway local database that
// global-setup starts. Running them outside server/'s vitest config (e.g. `npx vitest` from the repo root) would
// fall back to server/.env, which may point at production. Imported first by helpers.ts.
const url = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  throw new Error('API tests must run against the local test database: run them from server/ (npm test -w server).');
}
