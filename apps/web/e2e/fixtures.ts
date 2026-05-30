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
        // Seed a display-only "signed in" credential so the first-run welcome
        // modal stays hidden (the modal shows whenever signed out). The token is
        // never verified — only decoded for name/avatar — so a fake one is fine.
        const payload = btoa(
          JSON.stringify({ email: 'tester@example.com', name: 'Tester', exp: 9999999999 }),
        )
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        localStorage.setItem('dap:gcred', `x.${payload}.y`);
      } catch {
        /* storage may be unavailable */
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
