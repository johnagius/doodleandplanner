import { describe, expect, it } from 'vitest';
import { legibleScoreColor } from './wcFormat.js';

/** Perceived brightness 0..255 of a #rrggbb string. */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

describe('legibleScoreColor', () => {
  it('darkens washed-out colours so the score shows on the white card', () => {
    // Saudi Arabia / Iran are pure white in ESPN — the "missing score" bug.
    const c = legibleScoreColor('#FFFFFF')!;
    expect(c).toBe('#afafaf');
    expect(lum(c)).toBeLessThanOrEqual(176);
  });

  it('lightens near-black colours so the score shows in dark mode', () => {
    const c = legibleScoreColor('#000000')!; // New Zealand
    expect(c).toBe('#4b4b4b');
    expect(lum(c)).toBeGreaterThanOrEqual(74);
  });

  it('leaves a legible mid-tone brand colour untouched', () => {
    expect(legibleScoreColor('#55B5E5')).toBe('#55b5e5'); // Uruguay celeste
    expect(legibleScoreColor('55b5e5')).toBe('#55b5e5'); // leading # optional
  });

  it('returns undefined for a missing or invalid colour (caller uses its default)', () => {
    expect(legibleScoreColor(null)).toBeUndefined();
    expect(legibleScoreColor(undefined)).toBeUndefined();
    expect(legibleScoreColor('')).toBeUndefined();
    expect(legibleScoreColor('not-a-colour')).toBeUndefined();
  });
});
