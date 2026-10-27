import { test, expect, loginAsDemo } from './fixtures';

test('demo: log a workout with a PR, add food and cardio, switch units', async ({ page }) => {
  await loginAsDemo(page);

  await test.step('log a workout from a routine', async () => {
    await page.goto('/train/log');
    await page.getByRole('button', { name: /Push Day/ }).click();
    await expect(page.getByText('Bench Press', { exact: true }).first()).toBeVisible();
    // Last session's numbers load asynchronously and show as placeholders; ticking a set uses them.
    await expect(page.getByRole('textbox', { name: /Set 1 weight/ }).first()).toHaveAttribute('placeholder', /\d/);
    await page.getByRole('button', { name: 'Mark set 1 done' }).first().click();
    await page.getByRole('button', { name: 'Mark set 2 done' }).first().click();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('textbox', { name: /Set 3 weight/ }).first().fill('100');
    await page.getByRole('textbox', { name: /Set 3 reps/ }).first().fill('6');
    await page.getByRole('button', { name: 'Mark set 3 done' }).first().click();
    await page.getByRole('button', { name: 'Skip rest' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Save workout' }).click();
    await page.waitForURL(/\/train\/workouts\//);
    await expect(page.getByText('PR', { exact: true }).first()).toBeVisible();
  });

  await test.step('scan sheet deep link and manual food', async () => {
    await page.goto('/food?scan=1');
    await expect(page.getByRole('dialog', { name: 'Scan a meal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add food to Dinner' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to Dinner' });
    await dialog.getByRole('textbox', { name: 'Food name' }).fill('Test burrito');
    await dialog.getByRole('textbox', { name: 'kcal' }).fill('650');
    await dialog.getByRole('button', { name: 'Add food' }).click();
    await expect(page.getByText('Test burrito')).toBeVisible();
  });

  await test.step('log cardio', async () => {
    await page.goto('/train?tab=cardio');
    await page.getByRole('button', { name: 'Log cardio' }).first().click();
    const cardio = page.getByRole('dialog', { name: 'Log cardio' });
    await cardio.getByRole('radio', { name: 'Cycle' }).click();
    await cardio.getByRole('textbox', { name: 'Duration (min)' }).fill('40');
    await cardio.getByRole('textbox', { name: /Distance/ }).fill('16');
    await cardio.getByRole('button', { name: 'Save session' }).click();
    await expect(page.getByText('Cardio logged')).toBeVisible();
  });

  await test.step('switch to pounds and back', async () => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Pounds' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();
    await page.goto('/body');
    await expect(page.getByText('lb/wk')).toBeVisible();
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Kilograms' }).click();
    await expect(page.getByText('Settings saved').first()).toBeVisible();
  });
});
