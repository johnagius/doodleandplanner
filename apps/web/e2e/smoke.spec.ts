import { expect, test } from '@playwright/test';

test.describe('@smoke', () => {
  test('home page loads with the create and join cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Plan it together');
    await expect(page.getByRole('heading', { name: 'Start a new room' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Join with a code' })).toBeVisible();
    await expect(page.getByTestId('hero-canvas')).toBeVisible();
  });

  test('can create a room and land in the workspace', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Room name').fill('Smoke Trip');
    await page.getByLabel('Your name').fill('Tester');
    await page.getByRole('button', { name: 'Create room' }).click();

    await expect(page.getByRole('heading', { name: 'Smoke Trip' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Schedule/ })).toBeVisible();
    await expect(page).toHaveURL(/\/r\/[a-z0-9]+/);
  });
});
