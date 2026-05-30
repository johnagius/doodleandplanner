import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const SITE = 'https://doodleandplanner.pages.dev';
const log = [];
const out = (...a) => log.push(a.join(' '));
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const a = await ctx.newPage();
  await a.goto(SITE, { waitUntil: 'domcontentloaded' });
  await a.getByRole('button', { name: /continue as guest/i }).click();
  await a.getByPlaceholder(/Summer BBQ/i).fill(`BPlace ${Date.now().toString(36)}`);
  await a.getByLabel('Your name').fill('Alice');
  await a.getByRole('button', { name: /^Create room$/ }).click();
  await a.waitForURL(/\/r\/.+/, { timeout: 15000 });
  await a.waitForTimeout(900);
  // Solo: create battleship, but we need 2 players to start. Open a 2nd context.
  await a.getByRole('tab', { name: /Games/ }).click();
  await a.getByRole('button', { name: /Battleship/ }).click();
  await a.waitForTimeout(1000);
  const url = a.url();

  const b = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await b.goto(url, { waitUntil: 'domcontentloaded' });
  await b
    .getByLabel(/your name|name/i)
    .first()
    .fill('Bob')
    .catch(() => {});
  await b
    .getByRole('button', { name: /^Join/ })
    .click()
    .catch(() => {});
  await b.waitForTimeout(1500);
  await b.getByRole('tab', { name: /Games/ }).click();
  await b.waitForSelector('.game-list-item', { timeout: 10000 });
  await b.locator('.game-list-item').first().click();
  await b.getByRole('button', { name: /Take a seat/ }).click();
  await b.waitForTimeout(2500);
  await a.getByRole('button', { name: /Start game/ }).click({ timeout: 8000 });
  await a.waitForTimeout(2000);

  const shuffle = await a.getByRole('button', { name: /Shuffle/ }).count();
  const ready = await a.getByRole('button', { name: /^Ready$/ }).count();
  const status = (await a.locator('.game-status').textContent())?.trim();
  out('Shuffle btn:', shuffle, '| Ready btn:', ready, '| status:', status);
  await a.screenshot({ path: 'e2e/_shots/place.png' });
  out(shuffle > 0 && ready > 0 ? 'PLACEMENT UI: PASS' : 'PLACEMENT UI: FAIL');
} catch (e) {
  out('ERROR ' + e.message.split('\n')[0]);
} finally {
  await browser.close();
  writeFileSync('/tmp/place.log', log.join('\n') + '\n');
}
