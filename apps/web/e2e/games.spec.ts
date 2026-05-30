import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function createRoom(page: Page, name = 'E2E Game Night'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room name').fill(name);
  await page.getByLabel('Your name').fill('Alex');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('create a game from the catalog and see its lobby', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Games/ }).click();

  await expect(page.getByRole('heading', { name: /Start a game/ })).toBeVisible();
  await page.getByRole('button', { name: /Tic-Tac-Toe/ }).click();

  // Lobby: creator is seated, needs a second player before it can start.
  await expect(page.getByText(/Waiting for players \(1\/2\)/)).toBeVisible();
  await expect(page.getByText(/Need at least 2 players/)).toBeVisible();
  // Back to the hub shows the game listed as an open lobby.
  await page.getByRole('button', { name: /All games/ }).click();
  await expect(page.getByRole('heading', { name: 'Active games' })).toBeVisible();
  await expect(page.getByText(/Lobby · 1\/2/)).toBeVisible();
});

test('Dots & Boxes advertises 2–4 players', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Games/ }).click();
  await expect(page.getByText('2–4 players')).toBeVisible();
});
