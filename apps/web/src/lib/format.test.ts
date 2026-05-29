import { describe, expect, it } from 'vitest';
import { CURRENCIES, formatMoney } from './format.js';

describe('formatMoney', () => {
  it('formats euros with the currency symbol', () => {
    const s = formatMoney(40, 'EUR', 'en-US');
    expect(s).toContain('40');
    expect(s).toContain('€');
  });

  it('formats USD with grouping and two decimals', () => {
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
  });

  it('falls back gracefully for invalid currency codes', () => {
    expect(formatMoney(5, 'NOPE')).toBe('NOPE 5.00');
  });

  it('offers a list of currencies including EUR', () => {
    expect(CURRENCIES).toContain('EUR');
  });
});
