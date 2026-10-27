// End-to-end flow check on a phone viewport. Usage: node flow.mjs <outDir>
import { chromium } from 'playwright-core';

const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(`console: ${m.text()}`));
const step = (s) => console.log('✓', s);

await page.goto('http://localhost:5173/login');
await page.getByRole('button', { name: 'Explore the demo account' }).click();
await page.waitForURL('http://localhost:5173/');
step('logged in as demo');

// Workout from routine
await page.goto('http://localhost:5173/train/log');
await page.getByRole('button', { name: /Push Day/ }).click();
await page.getByText('Bench Press', { exact: true }).first().waitFor();
await page.waitForTimeout(800); // let "previous" values load
await page.getByRole('button', { name: 'Mark set 1 done' }).first().click();
await page.getByRole('button', { name: 'Mark set 2 done' }).first().click();
await page.getByRole('timer').waitFor();
step('ticked two sets using previous values; rest timer visible');
await page.screenshot({ path: `${out}/flow-logger.png` });

// Override a set with a heavier weight to trigger a PR
const weight3 = page.getByRole('textbox', { name: /Set 3 weight/ }).first();
await weight3.fill('100');
await page.getByRole('textbox', { name: /Set 3 reps/ }).first().fill('6');
await page.getByRole('button', { name: 'Mark set 3 done' }).first().click();
await page.getByRole('button', { name: 'Skip rest' }).click();
await page.getByRole('button', { name: 'Finish' }).click();
await page.getByRole('button', { name: 'Save workout' }).click();
await page.waitForURL(/\/train\/workouts\//);
await page.getByText('PR', { exact: true }).first().waitFor();
step('workout saved; detail page shows a PR');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/flow-detail.png`, fullPage: true });

// Food: scan sheet + manual add
await page.goto('http://localhost:5173/food?scan=1');
await page.getByRole('dialog', { name: 'Scan a meal' }).waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/flow-scan.png` });
step('scan sheet opens from deep link');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Add food to Dinner' }).click();
const dialog = page.getByRole('dialog', { name: 'Add to Dinner' });
await dialog.getByRole('textbox', { name: 'Food name' }).fill('Test burrito');
await dialog.getByRole('textbox', { name: 'kcal' }).fill('650');
await dialog.getByRole('button', { name: 'Add food' }).click();
await page.getByText('Test burrito').waitFor();
step('manual food entry added to dinner');

// Cardio
await page.goto('http://localhost:5173/train?tab=cardio');
try { await page.getByRole('button', { name: 'Log cardio' }).first().click({ timeout: 8000 }); } catch (e) { await page.screenshot({ path: `${out}/flow-fail.png` }); console.log('URL', page.url()); console.log(errors.join('\n')); throw e; }
const cardio = page.getByRole('dialog', { name: 'Log cardio' });
await cardio.getByRole('radio', { name: 'Cycle' }).click();
await cardio.getByRole('textbox', { name: 'Duration (min)' }).fill('40');
await cardio.getByRole('textbox', { name: /Distance/ }).fill('16');
await cardio.getByRole('button', { name: 'Save session' }).click();
await page.getByText('Cardio logged').waitFor();
step('cardio session logged');

// Units switch
await page.goto('http://localhost:5173/settings');
await page.getByRole('radio', { name: 'Pounds' }).click();
await page.getByText('Settings saved').waitFor();
await page.goto('http://localhost:5173/body');
await page.getByText('lb/wk').waitFor();
step('switched to lb; body page shows pounds');
await page.goto('http://localhost:5173/settings');
await page.getByRole('radio', { name: 'Kilograms' }).click();
await page.getByText('Settings saved').waitFor();

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
