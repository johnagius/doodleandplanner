import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function createRoom(page: Page, name = 'E2E Map Trip'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room name').fill(name);
  await page.getByLabel('Your name').fill('Alex');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('drop a meet-up pin on the map', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Map/ }).click();

  await expect(page.getByRole('button', { name: /Add a place/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Share my location/ })).toBeVisible();

  // Enter add-mode and click the map (latlng is derived from the pixel, so this
  // works without external tiles needing to load).
  await page.getByRole('button', { name: /Add a place/ }).click();
  const canvas = page.locator('.map-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('map canvas has no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.getByLabel('Place name').fill('North Gate');
  await page.getByRole('button', { name: /Save pin/ }).click();

  // The pin shows up in the meet-up list and as a marker on the map.
  await expect(page.getByText('North Gate')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(1);
});
