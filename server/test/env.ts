// Environment for the API tests. DATABASE_URL points at a throwaway database that global-setup resets.
export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'file:./test.db',
  JWT_SECRET: 'test-secret',
  RATE_LIMIT: 'off',
  GEMINI_API_KEY: '',
  RESEND_API_KEY: '',
  APP_URL: 'http://app.test',
};
