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

test('overlays shared availability on poll options', async ({ page }) => {
  const slug = await createRoom(page);
  await page.getByRole('button', { name: '+ New poll' }).click();
  await page.getByLabel('Poll title').fill('Movie night?');
  await page.getByRole('button', { name: 'Create poll' }).click();
  await expect(page.getByRole('heading', { name: 'Movie night?' })).toBeVisible();

  // Simulate "share my availability": a named event fully blocks option 1.
  await page.evaluate((s) => {
    const key = `dap:room:${s}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const me = rec.state.room.members[0].id;
    const opt = rec.state.polls[0].options[0];
    rec.state.availability = [
      {
        memberId: me,
        busy: [{ start: opt.start, end: opt.end, title: 'Dentist', status: 'busy' }],
        updatedAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(key, JSON.stringify(rec));
  }, slug);
  await page.reload();

  const pollCard = page.locator('.card', { hasText: 'Movie night?' });
  // Conflict-aware overlay: a hard clash that names the blocking event.
  await expect(pollCard.getByText(/can’t make it/)).toBeVisible();
  await expect(pollCard.getByText(/Dentist/)).toBeVisible();
});

test('manage the inventory checklist', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Inventory/ }).click();
  await page.getByLabel('Item name').fill('Tent');
  await page.getByLabel('Category').fill('Gear');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByText('Tent')).toBeVisible();
  await expect(page.getByText('unclaimed')).toBeVisible();
  // Category becomes a section header.
  await expect(page.locator('.section-label')).toContainText('Gear');
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

test('draw a rectangle shape on the doodle', async ({ page }) => {
  const slug = await createRoom(page);
  await page.getByRole('tab', { name: /Doodle/ }).click();
  await page.getByRole('button', { name: 'Rectangle' }).click();

  const canvas = page.getByTestId('doodle-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 6 });
  await page.mouse.up();

  const tool = await page.evaluate((s) => {
    const raw = localStorage.getItem(`dap:room:${s}`);
    const strokes = raw ? JSON.parse(raw).state.doodle.strokes : [];
    return strokes.at(-1)?.tool;
  }, slug);
  expect(tool).toBe('rect');
});

test('shows an invite link on the members tab', async ({ page }) => {
  const slug = await createRoom(page);
  await page.getByRole('tab', { name: /Members/ }).click();
  await expect(page.getByText(new RegExp(`/r/${slug}\\?invite=`)).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset link' })).toBeVisible();
});

test('owner can rename the room in settings', async ({ page }) => {
  await createRoom(page, 'Old Name');
  await page.getByRole('tab', { name: /Members/ }).click();

  const settings = page.locator('form', { hasText: 'Room settings' });
  await settings.getByLabel('Room name').fill('Shiny New Name');
  await settings.getByRole('button', { name: 'Save settings' }).click();

  await expect(page.getByRole('heading', { name: 'Shiny New Name' })).toBeVisible();
});

test('track item cost and see the budget split', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Inventory/ }).click();
  await page.getByLabel('Item name').fill('Tent');
  await page.getByLabel('Cost').fill('90');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /bring it/ }).click();

  const money = page.locator('.card', { hasText: 'Money' });
  await expect(money.getByText('Total')).toBeVisible();
  await expect(money.getByText('Per person')).toBeVisible();
  await expect(money.getByText('€90.00').first()).toBeVisible();
});

test('add a shared expense and see the split', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Inventory/ }).click();

  // The Money card appears once there's something to split.
  const money = page.locator('.card', { hasText: 'Money' });
  await money.getByRole('button', { name: '+ Expense' }).click();
  await money.getByLabel('Expense description').fill('Petrol');
  await money.getByLabel('Expense amount').fill('60');
  await money.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(money.getByText('Petrol')).toBeVisible();
  await expect(money.getByText(/Total/)).toBeVisible();
  await expect(money.getByText(/Settle up|Balances/)).toBeVisible();
});

test('build an itinerary running order from activities', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Activities/ }).click();
  await page.getByLabel('Activity title').fill('Breakfast');
  await page.getByRole('button', { name: 'Propose' }).click();
  await page.getByLabel('Activity title').fill('Hike');
  await page.getByRole('button', { name: 'Propose' }).click();

  const itinerary = page.locator('.card', { hasText: 'Running order' });
  await expect(itinerary).toBeVisible();
  await expect(itinerary.locator('.timeline-item')).toHaveCount(2);
  await expect(itinerary.getByText('Breakfast')).toBeVisible();
  await expect(itinerary.getByText('Hike')).toBeVisible();
});

test('post messages in the room discussion', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Chat/ }).click();

  await page.getByLabel('Message').fill('Hello team!');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByLabel('Message').fill('Who is in?');
  await page.getByRole('button', { name: 'Send' }).click();

  const log = page.getByTestId('chat-log');
  await expect(log.getByText('Hello team!')).toBeVisible();
  await expect(log.getByText('Who is in?')).toBeVisible();
});

test('export a room and re-import it', async ({ page }, testInfo) => {
  const slug = await createRoom(page, 'Export Trip');
  await page.getByRole('tab', { name: /Members/ }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export room/ }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('doodleandplanner-');
  const filePath = testInfo.outputPath('room.json');
  await download.saveAs(filePath);

  await page.goto('/');
  await page.getByLabel('Import a room file').setInputFiles(filePath);

  await expect(page).toHaveURL(new RegExp(`/r/${slug}`));
  await expect(page.getByRole('heading', { name: 'Export Trip' })).toBeVisible();
});

test('add an event to the plan and RSVP', async ({ page }) => {
  await createRoom(page);
  await page.getByRole('tab', { name: /Plan/ }).click();
  await page.getByRole('button', { name: '+ Add event' }).click();
  await page.getByLabel('Title').fill('Kickoff dinner');
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('Kickoff dinner')).toBeVisible();
  await expect(page.getByRole('button', { name: /\.ics/ })).toBeVisible();

  const card = page.locator('.card', { hasText: 'Kickoff dinner' });
  await expect(card.getByText(/0 going/)).toBeVisible();
  await card.getByRole('button', { name: /Going/ }).click();
  await expect(card.getByText(/1 going/)).toBeVisible();
});
