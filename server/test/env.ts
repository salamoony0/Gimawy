// Environment for the API tests. DATABASE_URL is set per run by global-setup (see setup-env.ts).
export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret',
  RATE_LIMIT: 'off',
  GEMINI_API_KEY: '',
  RESEND_API_KEY: '',
  APP_URL: 'http://app.test',
};
