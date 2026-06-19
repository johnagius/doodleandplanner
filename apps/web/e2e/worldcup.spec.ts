import { expect, test } from './fixtures';

test.describe('@smoke World Cup', () => {
  test('opens the predictions board from the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /world cup 2026 predictions/i }).click();
    await expect(page).toHaveURL(/\/world-cup$/);
    await expect(page.getByRole('heading', { name: /World Cup 2026 Predictions/ })).toBeVisible();
  });

  test('asks who you are, then shows fixtures and sections', async ({ page }) => {
    await page.goto('/world-cup');

    // First run asks who you are, offering the four default names.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const name of ['John', 'Daniel', 'Noel', 'Saviour']) {
      await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Group standings render for every group.
    await page.getByRole('tab', { name: /Groups/ }).click();
    await expect(page.getByText('Group A', { exact: true })).toBeVisible();
    await expect(page.getByText('Group L', { exact: true })).toBeVisible();

    // The knockout bracket is present (auto-populates as results come in).
    await page.getByRole('tab', { name: /Bracket/ }).click();
    await expect(page.getByText('Round of 32').first()).toBeVisible();

    // The day-by-day timeline tab is wired up (empty until results land).
    await page.getByRole('tab', { name: /Timeline/ }).click();
    await expect(page.getByText(/The race hasn't started/)).toBeVisible();

    // The per-player Performance tab is wired up (a picker + empty until picks).
    await page.getByRole('tab', { name: /Performance/ }).click();
    await expect(page.getByRole('tab', { name: /John/ })).toBeVisible();

    // Banter now lives in the hot zone: each fixture card has a comment thread.
    await page.getByRole('tab', { name: /Fixtures/ }).click();
    await expect(page.getByRole('button', { name: /Banter/ }).first()).toBeVisible();
  });

  test('@smoke arcade tab launches a playable mini-game', async ({ page }) => {
    await page.goto('/world-cup');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: /Arcade/ }).click();
    await expect(page.getByRole('heading', { name: /Arcade/ })).toBeVisible();

    // Launch the basketball game → canvas mounts and the Aim→Shoot flow works.
    await page.getByRole('button', { name: /Free Throws/ }).click();
    await expect(page.getByRole('img', { name: /basketball mini-game/ })).toBeVisible();
    const action = page.getByRole('button', { name: /Aim/ });
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.getByRole('button', { name: /Shoot/ })).toBeVisible();
  });
});
