import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real app in the installed Google Chrome (no browser download).
// They start their own API (:4100, throwaway e2e.db) and Vite (:5174), so a normal `npm run dev` can keep running.
const API = 4100;
const WEB = 5174;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1, // specs share one seeded database
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB}`,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/prepare-db.mjs && npm run dev -w server',
      url: `http://localhost:${API}/api/health`,
      env: { PORT: String(API), DATABASE_URL: 'file:./e2e.db', RATE_LIMIT: 'off', APP_URL: `http://localhost:${WEB}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -w client -- --port ${WEB} --strictPort`,
      url: `http://localhost:${WEB}`,
      env: { API_PORT: String(API) },
      reuseExistingServer: false,
    },
  ],
});
