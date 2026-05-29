import { expect, test, type Page } from '@playwright/test';

async function createRoom(page: Page, name = 'E2E Adventure'): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Room name').fill(name);
  await page.getByLabel('Your name').fill('Alex');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.url().split('/r/')[1]!.split('?')[0]!;
}

test('create a scheduling poll and vote on it', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('button', { name: '+ New poll' }).click();
  await page.getByLabel('Poll title').fill('Movie night?');
  await page.getByRole('button', { name: 'Create poll' }).click();

  await expect(page.getByRole('heading', { name: 'Movie night?' })).toBeVisible();
  await page.getByRole('button', { name: 'Vote yes' }).first().click();
  const pollCard = page.locator('.card', { hasText: 'Movie night?' });
  await expect(pollCard.getByText('👍 1')).toBeVisible();
  await expect(pollCard.getByText(/1 of 1 voted/)).toBeVisible();
});

test('manage the inventory checklist', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Inventory/ }).click();
  await page.getByLabel('Item name').fill('Tent');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByText('Tent')).toBeVisible();
  await expect(page.getByText('unclaimed')).toBeVisible();
  await page.getByRole('button', { name: /bring it/ }).click();
  await expect(page.getByText(/sorted/)).toBeVisible();
  await expect(page.getByRole('button', { name: /bring it/ })).toHaveCount(0);
});

test('propose an activity and express interest', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Activities/ }).click();
  await page.getByLabel('Activity title').fill('Sunset hike');
  await page.getByRole('button', { name: 'Propose' }).click();

  await expect(page.getByRole('heading', { name: 'Sunset hike' })).toBeVisible();
  await page.getByRole('button', { name: /I.?m in/ }).click();
  await expect(page.getByText('1 keen')).toBeVisible();
});

test('draw on the shared doodle and persist strokes', async ({ page }) => {
  const slug = await createRoom(page);
  await page.getByRole('tab', { name: /Doodle/ }).click();

  const canvas = page.getByTestId('doodle-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 60, { steps: 8 });
  await page.mouse.up();

  const strokeCount = await page.evaluate((s) => {
    const raw = localStorage.getItem(`dap:room:${s}`);
    return raw ? JSON.parse(raw).state.doodle.strokes.length : 0;
  }, slug);
  expect(strokeCount).toBeGreaterThan(0);
});

test('shows an invite link on the members tab', async ({ page }) => {
  const slug = await createRoom(page);
  await page.getByRole('tab', { name: /Members/ }).click();
  await expect(page.getByText(new RegExp(`/r/${slug}\\?invite=`)).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset link' })).toBeVisible();
});

test('add an event to the plan', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Plan/ }).click();
  await page.getByRole('button', { name: '+ Add event' }).click();
  await page.getByLabel('Title').fill('Kickoff dinner');
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('Kickoff dinner')).toBeVisible();
  await expect(page.getByRole('button', { name: /\.ics/ })).toBeVisible();
});
