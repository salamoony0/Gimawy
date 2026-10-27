import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { test, expect } from './fixtures';

// Same throwaway database the E2E API uses (see playwright.config.ts).
const prisma = new PrismaClient({ datasourceUrl: `file:${fileURLToPath(new URL('../../server/prisma/e2e.db', import.meta.url))}` });
test.afterAll(() => prisma.$disconnect());

test('change password, export, log out everywhere, reset by link, delete account', async ({ page }) => {
  const email = `account-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.evaluate(async (email) => {
    const send = (method: string, path: string, body: unknown) =>
      fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await send('POST', '/auth/register', { email, password: 'password1', name: 'Account Test' });
    await send('PATCH', '/auth/me', { onboarded: true });
  }, email);

  await test.step('change password', async () => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Change password' }).click();
    const sheet = page.getByRole('dialog', { name: 'Change password' });
    await sheet.getByLabel('Current password').fill('password1');
    await sheet.getByLabel('New password').fill('password2');
    await sheet.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password changed')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  await test.step('export my data', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^gymawy-export-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(data.user.email).toBe(email);
  });

  await test.step('log out everywhere, then request a reset', async () => {
    await page.getByRole('button', { name: 'Log out everywhere' }).click();
    await page.waitForURL('**/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();
  });

  await test.step('reset page sets a new password and signs in', async () => {
    // The emailed link only goes to the server log in dev, so mint an equivalent token directly.
    const token = randomBytes(32).toString('base64url');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await page.goto(`/reset?token=${token}`);
    await page.getByLabel('New password').fill('password3');
    await page.getByLabel('Confirm password').fill('password3');
    await page.getByRole('button', { name: 'Save and log in' }).click();
    await page.waitForURL('/');
  });

  await test.step('delete the account', async () => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete account' }).click();
    const sheet = page.getByRole('dialog', { name: 'Delete account' });
    await sheet.getByLabel('Password').fill('password3');
    await sheet.getByLabel('Type DELETE to confirm').fill('DELETE');
    await sheet.getByRole('button', { name: 'Delete forever' }).click();
    await page.waitForURL('**/login');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});
