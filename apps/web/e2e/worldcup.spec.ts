import { expect, test } from './fixtures';

test.describe('@smoke World Cup', () => {
  test('opens the predictions board from the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /world cup 2026 predictions/i }).click();
    await expect(page).toHaveURL(/\/world-cup$/);
    await expect(page.getByRole('heading', { name: /World Cup 2026 Predictions/ })).toBeVisible();
  });

  test('shows predictors, fixtures and switches sections', async ({ page }) => {
    await page.goto('/world-cup');

    // The four default predictors are offered with no login.
    for (const name of ['John', 'Daniel', 'Noel', 'Saviour']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }

    // Group standings render for every group.
    await page.getByRole('tab', { name: /Groups/ }).click();
    await expect(page.getByText('Group A', { exact: true })).toBeVisible();
    await expect(page.getByText('Group L', { exact: true })).toBeVisible();

    // The knockout bracket is present (auto-populates as results come in).
    await page.getByRole('tab', { name: /Bracket/ }).click();
    await expect(page.getByText('Round of 32').first()).toBeVisible();
  });
});
