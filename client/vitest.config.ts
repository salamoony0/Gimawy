import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the PWA and Tailwind plugins don't load for unit tests.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
