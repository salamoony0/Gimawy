import { test, expect } from './fixtures';

test('register → setup plan → dashboard goal → incline walk estimate', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/setup');

  await page.getByRole('radio', { name: 'Male', exact: true }).click();
  // Born on 1 January 28 years ago, so the age is always 28.
  await page.getByLabel('Date of birth').fill(`${new Date().getFullYear() - 28}-01-01`);
  await page.getByLabel('Height', { exact: true }).fill('178');
  await page.getByLabel('Current weight').fill('85');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Moderately active/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Lose fat/ }).click();
  await page.getByRole('radio', { name: /Steady/ }).click();
  await page.getByLabel('Target weight (optional)').fill('78');
  await page.getByRole('button', { name: 'Continue' }).click();
  // Same inputs and answer as the energy.ts unit test.
  await expect(page.locator('p.text-7xl')).toHaveText('2,280');
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await page.waitForURL('/');
  await expect(page.getByText('Cut to 78 kg').first()).toBeVisible();

  await page.goto('/train?tab=cardio');
  await page.getByRole('button', { name: 'Log cardio' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Log cardio' });
  await sheet.getByRole('radio', { name: 'Incline walk' }).click();
  await sheet.getByRole('button', { name: '12-3-30' }).click();
  await expect(sheet.getByText(/kcal burned/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Save session' }).click();
  await expect(page.getByText('Cardio logged')).toBeVisible();
  await expect(page.getByText(/12% @/).first()).toBeVisible();
});
