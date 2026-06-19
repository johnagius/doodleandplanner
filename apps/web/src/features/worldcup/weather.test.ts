import { describe, expect, it } from 'vitest';
import { forecastDate, withinForecastWindow, wmoLook } from './weather.js';

describe('forecastDate', () => {
  it('takes the UTC date off a kickoff ISO string', () => {
    expect(forecastDate('2026-06-19T18:00:00Z')).toBe('2026-06-19');
  });
});

describe('withinForecastWindow', () => {
  const now = Date.parse('2026-06-19T12:00:00Z');
  it('includes today and the next ~16 days', () => {
    expect(withinForecastWindow('2026-06-19T20:00:00Z', now)).toBe(true);
    expect(withinForecastWindow('2026-07-02T18:00:00Z', now)).toBe(true);
  });
  it('excludes far-future and long-past matches (use the estimate instead)', () => {
    expect(withinForecastWindow('2026-07-19T18:00:00Z', now)).toBe(false); // a month out
    expect(withinForecastWindow('2026-06-10T18:00:00Z', now)).toBe(false); // over a week ago
    expect(withinForecastWindow('not-a-date', now)).toBe(false);
  });
});

describe('wmoLook', () => {
  it('maps WMO codes to an emoji + label', () => {
    expect(wmoLook(0).label).toBe('Clear');
    expect(wmoLook(3).label).toBe('Cloudy');
    expect(wmoLook(63).label).toBe('Rain');
    expect(wmoLook(95).emoji).toBe('⛈️');
  });
});
