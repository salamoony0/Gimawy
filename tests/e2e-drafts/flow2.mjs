// New-user onboarding + incline cardio flow. Usage: node flow2.mjs <outDir>
import { chromium } from 'playwright-core';

const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(`console: ${m.text()}`));
const step = (s) => console.log('✓', s);

await page.goto('http://localhost:5173/register');
await page.getByLabel('Name').fill('Test User');
await page.getByLabel('Email').fill(`test${Date.now()}@example.com`);
await page.getByLabel('Password').fill('password123');
await page.getByRole('button', { name: 'Create account' }).click();
await page.waitForURL('**/setup');
step('register redirects to /setup');

await page.getByRole('radio', { name: 'Male', exact: true }).click();
await page.getByLabel('Date of birth').fill('1998-03-10');
await page.getByLabel('Height', { exact: true }).fill('178');
await page.getByLabel('Current weight').fill('85');
await page.screenshot({ path: `${out}/setup-1.png`, fullPage: true });
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('radio', { name: /Moderately active/ }).click();
await page.screenshot({ path: `${out}/setup-2.png`, fullPage: true });
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('radio', { name: /Lose fat/ }).click();
await page.getByRole('radio', { name: /Steady/ }).click();
await page.getByLabel('Target weight (optional)').fill('78');
await page.screenshot({ path: `${out}/setup-3.png`, fullPage: true });
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(1200);
const kcal = await page.locator('p.text-7xl').innerText();
console.log('  plan calories shown:', kcal);
await page.screenshot({ path: `${out}/setup-4.png`, fullPage: true });
await page.getByRole('button', { name: 'Start tracking' }).click();
await page.waitForURL('http://localhost:5173/');
await page.getByText('Cut to 78 kg').first().waitFor();
step('saved plan; dashboard shows auto-created weight goal');

await page.goto('http://localhost:5173/train?tab=cardio');
await page.getByRole('button', { name: 'Log cardio' }).first().click();
const sheet = page.getByRole('dialog', { name: 'Log cardio' });
await sheet.getByRole('radio', { name: 'Incline walk' }).click();
await sheet.getByRole('button', { name: '12-3-30' }).click();
await page.waitForTimeout(300);
const est = await sheet.getByText(/kcal burned/).innerText();
console.log('  estimate shown:', est.replace(/\s+/g, ' '));
await page.screenshot({ path: `${out}/incline.png` });
await sheet.getByRole('button', { name: 'Save session' }).click();
await page.getByText('Cardio logged').waitFor();
await page.getByText(/12% @/).first().waitFor();
step('incline walk saved with incline/speed shown in list');

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
