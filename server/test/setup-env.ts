import { inject } from 'vitest';

// Runs in each test worker before the test file (and so before Prisma) is imported.
process.env.DATABASE_URL = process.env.DIRECT_URL = inject('databaseUrl');
