import { test, expect, loginAsDemo } from './fixtures';

test('edit and delete saved items', async ({ page }) => {
  await loginAsDemo(page);

  let detailUrl = '';
  await test.step('edit a workout set to a PR', async () => {
    await page.goto('/train');
    await page.locator('a[href^="/train/workouts/"]').first().click();
    await page.waitForURL(/\/train\/workouts\//);
    detailUrl = page.url();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForURL('**/train/log');
    await expect(page.getByText('Editing', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: /Set 2 weight/ }).first().fill('200');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(detailUrl);
    await expect(page.getByText('200 kg', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PR', { exact: true }).first()).toBeVisible();
  });

  await test.step('edit a food entry', async () => {
    await page.goto('/food');
    await page.getByRole('button', { name: /^Edit / }).first().click();
    const food = page.getByRole('dialog', { name: 'Edit food' });
    await food.getByRole('textbox', { name: 'Food name' }).fill('Edited oatmeal');
    await food.getByRole('radio', { name: 'Snacks' }).click();
    await food.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Entry updated')).toBeVisible();
    await expect(page.getByText('Edited oatmeal')).toBeVisible();
  });

  await test.step('edit a cardio session', async () => {
    await page.goto('/train?tab=cardio');
    await page.getByRole('button', { name: /^Edit / }).first().click();
    const cardio = page.getByRole('dialog', { name: 'Edit cardio' });
    await cardio.getByRole('textbox', { name: 'Duration (min)' }).fill('55');
    await cardio.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Session updated')).toBeVisible();
    await expect(page.getByText('55m').first()).toBeVisible();
  });

  await test.step('create and reorder a routine', async () => {
    await page.goto('/train');
    await page.getByRole('button', { name: 'New routine' }).click();
    const r = page.getByRole('dialog', { name: 'New routine' });
    await r.getByRole('textbox', { name: 'Name' }).fill('Arm Day');
    await r.getByRole('button', { name: 'Add exercises' }).click();
    const picker = page.getByRole('dialog', { name: 'Add exercise' });
    await picker.getByRole('textbox', { name: 'Search exercises' }).fill('curl');
    await picker.getByRole('button', { name: /Barbell Curl/ }).click();
    await picker.getByRole('button', { name: /Hammer Curl/ }).click();
    await picker.getByRole('button', { name: /Add 2 exercises/ }).click();
    await r.getByRole('button', { name: 'Create routine' }).click();
    await expect(page.getByText('Routine created')).toBeVisible();
    await page.getByRole('button', { name: 'Edit routine Arm Day' }).click();
    const er = page.getByRole('dialog', { name: 'Edit routine' });
    await er.getByRole('button', { name: 'Move Hammer Curl up' }).click();
    await er.getByRole('button', { name: 'Save routine' }).click();
    await expect(page.getByText('Routine updated')).toBeVisible();
  });

  await test.step('edit a goal', async () => {
    await page.goto('/body');
    await page.getByRole('button', { name: /^Edit goal Bench/ }).click();
    const g = page.getByRole('dialog', { name: 'Edit goal' });
    await g.getByRole('textbox', { name: /Target/ }).fill('130');
    await g.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('Goal updated')).toBeVisible();
  });

  await test.step('delete an unused custom exercise', async () => {
    const id = await page.evaluate(() =>
      fetch('/api/exercises', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test Press', muscleGroup: 'chest', equipment: 'machine' }),
      })
        .then((r) => r.json())
        .then((e) => e.id as string),
    );
    await page.goto(`/train/exercises/${id}`);
    await expect(page.getByText('Custom exercise')).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog', { name: 'Edit exercise' }).getByRole('button', { name: 'Delete exercise' }).click();
    await page.waitForURL(/tab=exercises/);
  });

  await test.step('delete the edited workout', async () => {
    await page.goto(detailUrl);
    await page.getByRole('button', { name: 'Delete workout' }).click();
    await page.getByRole('dialog', { name: 'Delete workout?' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL(/\/train$/);
  });
});
