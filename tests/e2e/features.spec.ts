import { test, expect, loginAsDemo } from './fixtures';

test('supersets: no rest between linked exercises, grouped on the saved workout', async ({ page }) => {
  await loginAsDemo(page);
  await page.goto('/train/log');
  await page.getByRole('button', { name: /Pull Day/ }).click();

  const first = page.locator('section.card').first();
  const firstName = (await first.locator('a').first().textContent())!.trim();
  await page.getByRole('button', { name: `Options for ${firstName}` }).click();
  await page.getByRole('button', { name: 'Superset with next' }).click();
  await expect(page.getByLabel('Superset A, exercise 1 of 2')).toBeVisible();
  await expect(page.getByLabel('Superset A, exercise 2 of 2')).toBeVisible();
  await expect(page.getByText(/No rest, straight to/)).toBeVisible();

  // Exercise 1 of the superset: no rest timer. Exercise 2 (end of the round): rest starts.
  await expect(page.getByRole('textbox', { name: /Set 1 weight/ }).first()).toHaveAttribute('placeholder', /\d/);
  await page.getByRole('button', { name: 'Mark set 1 done' }).first().click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark set 1 done' }).nth(0).click(); // the first exercise's button is now "Set 1 done"
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Skip rest' }).click();

  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await page.waitForURL(/\/train\/workouts\//);
  await expect(page.getByText('Superset A')).toBeVisible();
  await expect(page.getByLabel('Superset A, exercise 2 of 2')).toBeVisible();
});

test('barcode: type a code, pick an amount, log it', async ({ page }) => {
  // The API's Open Food Facts lookup is covered by the server tests; here the browser gets a fixed answer.
  await page.route('**/api/food/barcode/3017620422003', (route) =>
    route.fulfill({
      json: {
        code: '3017620422003',
        mine: null,
        product: {
          code: '3017620422003',
          name: 'Hazelnut spread',
          brand: 'Testco',
          per100g: { calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
          serving: { label: '15 g', grams: 15 },
        },
      },
    }),
  );
  await loginAsDemo(page);
  await page.goto('/food');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scan a barcode' });
  await sheet.getByRole('textbox', { name: /type the number/ }).fill('3017620422004');
  await expect(sheet.getByText('doesn’t look like a valid barcode')).toBeVisible();
  await sheet.getByRole('textbox', { name: /type the number/ }).fill('3017620422003');
  await sheet.getByRole('button', { name: 'Look up' }).click();

  await expect(sheet.getByText('Hazelnut spread')).toBeVisible();
  await expect(sheet.getByRole('textbox', { name: 'Amount (g or ml)' })).toHaveValue('15');
  await sheet.getByRole('button', { name: '100 g' }).click();
  await sheet.getByRole('button', { name: 'Log 539 kcal' }).click();
  await expect(page.getByText('Hazelnut spread (Testco)', { exact: true })).toBeVisible();
});

test('offline: food logged without a connection syncs when it comes back', async ({ page, context, errors }) => {
  await loginAsDemo(page);
  await page.goto('/food');
  await expect(page.getByRole('heading', { name: 'Breakfast' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add food to Snacks' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to Snacks' });
  await dialog.getByRole('textbox', { name: 'Food name' }).fill('Offline oats');
  await dialog.getByRole('textbox', { name: 'kcal' }).fill('380');
  await dialog.getByRole('button', { name: 'Add food' }).click();
  await expect(page.getByText(/Offline oats saved on this device/)).toBeVisible();
  await expect(page.getByText(/1 entry is saved on this device/)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Synced 1 offline change')).toBeVisible();
  await expect(page.getByText('Offline oats', { exact: true })).toBeVisible();
  await expect(page.getByText(/saved on this device and will sync/)).toHaveCount(0);

  // Requests made while offline log network errors; those are the point of this test.
  errors.splice(0, errors.length, ...errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/.test(e)));
});

test('adaptive target: the demo’s month of logs gives a measured maintenance and a suggestion', async ({ page }) => {
  await loginAsDemo(page);
  await page.goto('/food');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Adaptive target' }) });
  await expect(card.getByText('Your maintenance')).toBeVisible();
  await expect(card.getByText(/logged days averaging/)).toBeVisible();
  await card.getByRole('checkbox', { name: /Adjust my targets automatically/ }).check();
  await expect(card.getByRole('checkbox', { name: /Adjust my targets automatically/ })).toBeChecked();
  await page.goto('/settings');
  await expect(page.getByRole('checkbox', { name: /Adjust my targets automatically/ })).toBeChecked();
});
