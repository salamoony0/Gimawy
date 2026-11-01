import { test, expect, loginAsDemo } from './fixtures';

// Real typing, one key at a time (fill() sets the whole value at once and hid a focus bug in sheets).
test('typing word by word keeps focus in every kind of form', async ({ page }) => {
  await page.route('**/api/food/search/products**', (route) => route.fulfill({ json: { products: [] } }));
  await loginAsDemo(page);

  await page.goto('/food');
  await page.getByRole('button', { name: 'Add food to Lunch' }).click();
  const add = page.getByRole('dialog', { name: 'Add to Lunch' });
  await add.getByRole('searchbox', { name: 'Search foods' }).pressSequentially('koshari');
  await expect(add.getByRole('searchbox', { name: 'Search foods' })).toHaveValue('koshari');
  await add.getByRole('searchbox', { name: 'Search foods' }).fill('');
  await add.getByRole('textbox', { name: 'Food name' }).pressSequentially('Grandma soup');
  await add.getByRole('textbox', { name: 'kcal' }).pressSequentially('350');
  await expect(add.getByRole('textbox', { name: 'Food name' })).toHaveValue('Grandma soup');
  await expect(add.getByRole('textbox', { name: 'kcal' })).toHaveValue('350');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Edit / }).first().click();
  const edit = page.getByRole('dialog', { name: 'Edit food' });
  const name = edit.getByRole('textbox', { name: 'Food name' });
  await name.fill('');
  await name.pressSequentially('Renamed food');
  await expect(name).toHaveValue('Renamed food');
  await page.keyboard.press('Escape');

  await page.goto('/train?tab=cardio');
  await page.getByRole('button', { name: 'Log cardio' }).first().click();
  const cardio = page.getByRole('dialog', { name: 'Log cardio' });
  const duration = cardio.getByRole('textbox', { name: /Duration/ });
  await duration.pressSequentially('45');
  await expect(duration).toHaveValue('45');
  await page.keyboard.press('Escape');

  await page.goto('/train/log');
  await page.getByRole('button', { name: /Push Day/ }).click();
  const weight = page.getByRole('textbox', { name: /Set 3 weight/ }).first();
  await weight.pressSequentially('102.5');
  await expect(weight).toHaveValue('102.5');

  await page.goto('/settings');
  const calories = page.getByRole('textbox', { name: 'Calories (kcal)' });
  await calories.fill('');
  await calories.pressSequentially('2450');
  await expect(calories).toHaveValue('2450');
});
