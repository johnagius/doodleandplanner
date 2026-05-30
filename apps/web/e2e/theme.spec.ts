import { expect, test } from './fixtures';

test('toggles dark mode and remembers it across reloads', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');

  const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
  const before = await html.getAttribute('data-theme');
  await toggle.click();
  const after = await html.getAttribute('data-theme');
  expect(after).not.toBe(before);
  expect(after).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
