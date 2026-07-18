import { expect, test } from './fixtures';

test.describe('@smoke Club Football', () => {
  test('opens the board from the home page', async ({ page }) => {
    await page.goto('/');
    await page.locator('[aria-label="Open Club Football predictions"]').click();
    await expect(page).toHaveURL(/\/club$/);
    await expect(page.getByRole('heading', { name: /Club Football/ })).toBeVisible();
  });

  test('shows identity, the tabs and the guide', async ({ page }) => {
    await page.goto('/club');

    // Standalone board: its own hero renders (the Doodle & Planner topbar is hidden).
    await expect(page.getByRole('heading', { name: /Club Football/ })).toBeVisible();

    // Identity chips offer the default names to play as.
    await expect(page.getByRole('button', { name: 'John', exact: true })).toBeVisible();

    // All four sections are wired up.
    for (const name of ['Fixtures', 'Season table', 'Divisions', 'How to play']) {
      await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
    }

    // The guide explains the game (resilient to the live feed being empty).
    await page.getByRole('tab', { name: /How to play/ }).click();
    await expect(page.getByText(/The ten clubs/)).toBeVisible();

    // Divisions surfaces the season timeline with dates.
    await page.getByRole('tab', { name: /Divisions/ }).click();
    await expect(page.getByText(/Season timeline/)).toBeVisible();
  });
});
