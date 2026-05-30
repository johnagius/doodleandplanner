import { expect, test } from './fixtures';

test.describe('@smoke PWA', () => {
  test('serves a linked web app manifest with icons', async ({ page, request }) => {
    await page.goto('/');

    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(manifestHref).toBeTruthy();

    const res = await request.get(manifestHref!);
    expect(res.ok()).toBeTruthy();

    const manifest = await res.json();
    expect(manifest.name).toContain('Doodle');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);

    // The referenced icon must actually resolve (icon src is relative to the manifest).
    const manifestUrl = new URL(manifestHref!, page.url());
    const iconUrl = new URL(manifest.icons[0].src, manifestUrl).toString();
    const iconRes = await request.get(iconUrl);
    expect(iconRes.ok()).toBeTruthy();
  });
});
