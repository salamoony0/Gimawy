// Phase 2 account flows. Usage: node flow4.mjs <outDir> <serverLogFile>
// The reset link is read from the server log (RESEND_API_KEY unset in dev).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const [out, log] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/40[1349]/.test(m.text()) && errors.push(`console: ${m.text()}`));
const step = (s) => console.log('✓', s);
const email = `flow4-${Date.now()}@example.com`;

// Account via API, skip onboarding
await page.goto('http://localhost:5173/login');
await page.evaluate(async (email) => {
  const post = (m, p, b) => fetch(`/api${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  await post('POST', '/auth/register', { email, password: 'password1', name: 'Flow Four' });
  await post('PATCH', '/auth/me', { onboarded: true });
}, email);

// Change password
await page.goto('http://localhost:5173/settings');
await page.getByRole('button', { name: 'Change password' }).click();
const pw = page.getByRole('dialog', { name: 'Change password' });
await pw.getByLabel('Current password').fill('password1');
await pw.getByLabel('New password').fill('password2');
await pw.getByRole('button', { name: 'Change password' }).click();
await page.getByText('Password changed').waitFor();
await page.reload();
await page.getByRole('heading', { name: 'Settings' }).waitFor();
step('password changed; this session survives a reload');

// Export
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]);
const data = JSON.parse(readFileSync(await download.path(), 'utf8'));
if (data.user.email !== email || !Array.isArray(data.workouts)) throw new Error('export looks wrong');
step(`export downloaded (${download.suggestedFilename()})`);

// Log out everywhere → forgot → reset
await page.screenshot({ path: `${out}/security-card.png`, fullPage: true });
await page.getByRole('button', { name: 'Log out everywhere' }).click();
await page.waitForURL('**/login');
await page.getByRole('link', { name: 'Forgot password?' }).click();
await page.getByLabel('Email').fill(email);
await page.getByRole('button', { name: 'Send reset link' }).click();
await page.getByText('Check your email').waitFor();
step('logged out everywhere; reset requested');

let link;
for (let i = 0; i < 20 && !link; i++) {
  const m = [...readFileSync(log, 'utf8').matchAll(/http:\/\/localhost:5173\/reset\?token=[\w-]+/g)].at(-1);
  if (m && readFileSync(log, 'utf8').lastIndexOf(email) < m.index) link = m[0];
  else await new Promise((r) => setTimeout(r, 250));
}
if (!link) throw new Error('reset link not found in server log');
await page.goto(link);
await page.getByLabel('New password').fill('password3');
await page.getByLabel('Confirm password').fill('password3');
await page.getByRole('button', { name: 'Save and log in' }).click();
await page.waitForURL('http://localhost:5173/');
step('reset link set a new password and signed in');

// Delete account
await page.goto('http://localhost:5173/settings');
await page.getByRole('button', { name: 'Delete account' }).click();
const del = page.getByRole('dialog', { name: 'Delete account' });
await del.getByLabel('Password').fill('password3');
await del.getByLabel('Type DELETE to confirm').fill('DELETE');
await page.screenshot({ path: `${out}/delete-account.png` });
await del.getByRole('button', { name: 'Delete forever' }).click();
await page.waitForURL('**/login');
const status = await page.evaluate((email) => fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password3' }) }).then((r) => r.status), email);
if (status !== 401) throw new Error(`login after delete returned ${status}`);
step('account deleted; login no longer works');

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
