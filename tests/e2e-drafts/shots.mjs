// Usage: node shots.mjs <outDir> <mobile|desktop> <path...>
import { chromium } from 'playwright-core';

const [, , outDir, mode, ...paths] = process.argv;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext(
  mode === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' },
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

await page.goto('http://localhost:5173/login');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${outDir}/${mode}-login.png`, fullPage: true });
await page.getByRole('button', { name: 'Explore the demo account' }).click();
await page.waitForURL('http://localhost:5173/');

for (const p of paths) {
  await page.goto(`http://localhost:5173${p}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const name = p.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'today';
  await page.screenshot({ path: `${outDir}/${mode}-${name}.png`, fullPage: true });
  console.log('shot', name);
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
