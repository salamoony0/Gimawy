import { test as base, expect, type Page } from '@playwright/test';

/** Every test fails if the page logs an error (401/404/409 responses are expected in some flows). */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/40[1349]/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function loginAsDemo(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore the demo account' }).click();
  await page.waitForURL('/');
}
