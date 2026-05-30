import { test as base } from '@playwright/test';

/**
 * Shared test base that suppresses the first-run welcome modal so specs begin
 * like a returning visitor (the modal itself is covered by unit tests). Runs
 * before every navigation via an init script.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('dap:welcomeSeen', '1');
      } catch {
        /* storage may be unavailable */
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
