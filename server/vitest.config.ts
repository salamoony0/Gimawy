import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/env.ts';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: TEST_ENV,
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // One database shared by every file, so run files one at a time.
    fileParallelism: false,
  },
});
