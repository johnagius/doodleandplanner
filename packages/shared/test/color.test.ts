import { describe, expect, it } from 'vitest';
import { MEMBER_PALETTE, colorForIndex, colorForKey, initials } from '../src/color.js';

describe('colorForIndex', () => {
  it('wraps around the palette', () => {
    expect(colorForIndex(0)).toBe(MEMBER_PALETTE[0]);
    expect(colorForIndex(MEMBER_PALETTE.length)).toBe(MEMBER_PALETTE[0]);
  });
});

describe('colorForKey', () => {
  it('is deterministic and within the palette', () => {
    const c1 = colorForKey('alice');
    const c2 = colorForKey('alice');
    expect(c1).toBe(c2);
    expect(MEMBER_PALETTE).toContain(c1 as (typeof MEMBER_PALETTE)[number]);
  });
});

describe('initials', () => {
  it.each([
    ['Alice', 'AL'],
    ['Alice Wonderland', 'AW'],
    ['  bob   smith jones ', 'BJ'],
    ['x', 'X'],
    ['', '?'],
  ])('initials(%j) = %j', (input, expected) => {
    expect(initials(input)).toBe(expected);
  });
});
