// Phase 1 edit flows. Usage: node flow3.mjs <outDir>
import { chromium } from 'playwright-core';

const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/40[19]/.test(m.text()) && errors.push(`console: ${m.text()}`));
const step = (s) => console.log('✓', s);

await page.goto('http://localhost:5173/login');
await page.getByRole('button', { name: 'Explore the demo account' }).click();
await page.waitForURL('http://localhost:5173/');

// Workout edit: bump the first working set and save
await page.goto('http://localhost:5173/train');
await page.locator('a[href^="/train/workouts/"]').first().click();
await page.waitForURL(/\/train\/workouts\//);
await page.getByRole('button', { name: 'Delete workout' }).waitFor();
const detailUrl = page.url();
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.waitForURL('**/train/log');
await page.getByText('Editing').waitFor();
const w = page.getByRole('textbox', { name: /Set 2 weight/ }).first();
await w.fill('200');
await page.screenshot({ path: `${out}/edit-workout.png` });
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForURL(detailUrl);
await page.getByText('200 kg', { exact: true }).first().waitFor();
await page.getByText('PR', { exact: true }).first().waitFor();
step('workout edited: 200 kg set saved and flagged as PR');

// Food edit
await page.goto('http://localhost:5173/food');
await page.getByRole('button', { name: /^Edit / }).first().click();
const food = page.getByRole('dialog', { name: 'Edit food' });
await food.getByRole('textbox', { name: 'Food name' }).fill('Edited oatmeal');
await food.getByRole('radio', { name: 'Snacks' }).click();
await food.getByRole('button', { name: 'Save changes' }).click();
await page.getByText('Entry updated').waitFor();
await page.getByText('Edited oatmeal').waitFor();
step('food entry renamed and moved to snacks');

// Cardio edit
await page.goto('http://localhost:5173/train?tab=cardio');
await page.getByRole('button', { name: /^Edit / }).first().click();
const cardio = page.getByRole('dialog', { name: 'Edit cardio' });
await cardio.getByRole('textbox', { name: 'Duration (min)' }).fill('55');
await cardio.getByRole('button', { name: 'Save changes' }).click();
await page.getByText('Session updated').waitFor();
await page.getByText('55m').first().waitFor();
step('cardio duration edited to 55 min');

// Routine create + edit
await page.goto('http://localhost:5173/train');
await page.getByRole('button', { name: 'New routine' }).click();
const r = page.getByRole('dialog', { name: 'New routine' });
await r.getByRole('textbox', { name: 'Name' }).fill('Arm Day');
await r.getByRole('button', { name: 'Add exercises' }).click();
const picker = page.getByRole('dialog', { name: 'Add exercise' });
await picker.getByRole('textbox', { name: 'Search exercises' }).fill('curl');
await picker.getByRole('button', { name: /Barbell Curl/ }).click();
await picker.getByRole('button', { name: /Hammer Curl/ }).click();
await picker.getByRole('button', { name: /Add 2 exercises/ }).click();
await page.getByRole('dialog', { name: 'New routine' }).getByRole('button', { name: 'Create routine' }).click();
await page.getByText('Routine created').waitFor();
await page.getByRole('button', { name: 'Edit routine Arm Day' }).click();
const er = page.getByRole('dialog', { name: 'Edit routine' });
await er.getByRole('button', { name: 'Move Hammer Curl up' }).click();
await er.getByRole('button', { name: 'Save routine' }).click();
await page.getByText('Routine updated').waitFor();
step('routine created, reordered and saved');

// Goal edit
await page.goto('http://localhost:5173/body');
await page.getByRole('button', { name: /^Edit goal Bench/ }).click();
const g = page.getByRole('dialog', { name: 'Edit goal' });
await g.getByRole('textbox', { name: /Target/ }).fill('130');
await g.getByRole('button', { name: 'Save goal' }).click();
await page.getByText('Goal updated').waitFor();
step('goal target edited');

// Custom exercise create (via API) → delete
await page.evaluate(() => fetch('/api/exercises', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Press', muscleGroup: 'chest', equipment: 'machine' }) }).then((r) => r.json()).then((e) => (location.href = `/train/exercises/${e.id}`)));
await page.waitForURL(/\/train\/exercises\//);
await page.getByText('Custom exercise').waitFor();
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.getByRole('dialog', { name: 'Edit exercise' }).getByRole('button', { name: 'Delete exercise' }).click();
await page.waitForURL(/tab=exercises/);
step('unused custom exercise deleted');

// Workout delete (should not refetch the deleted workout → no 404)
await page.goto(detailUrl);
await page.getByRole('button', { name: 'Delete workout' }).click();
await page.getByRole('dialog', { name: 'Delete workout?' }).getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForURL(/\/train$/);
step('workout deleted');

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
