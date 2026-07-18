import { describe, expect, it } from 'vitest';
import { formatFixtureDayLong, formatKickoff, maltaDayKey } from './clubFormat.js';

/**
 * Malta time is UTC+2 in summer (CEST) and UTC+1 in winter (CET). A late-night
 * European kick-off therefore rolls into the *next* Malta day — these tests lock
 * that DST-aware grouping so fixtures never land under the wrong date heading.
 */
describe('clubFormat (Malta time)', () => {
  it('groups a late summer kick-off under the next Malta day (UTC+2)', () => {
    // 23:30Z on 15 Aug → 01:30 on 16 Aug in Malta.
    expect(maltaDayKey('2026-08-15T23:30:00.000Z')).toBe('2026-08-16');
    expect(formatKickoff('2026-08-15T23:30:00.000Z')).toBe('01:30');
  });

  it('groups a late winter kick-off under the next Malta day (UTC+1)', () => {
    // 23:30Z on 15 Dec → 00:30 on 16 Dec in Malta.
    expect(maltaDayKey('2026-12-15T23:30:00.000Z')).toBe('2026-12-16');
    expect(formatKickoff('2026-12-15T23:30:00.000Z')).toBe('00:30');
  });

  it('keeps a daytime kick-off on the same day', () => {
    expect(maltaDayKey('2026-08-15T12:00:00.000Z')).toBe('2026-08-15');
    expect(formatKickoff('2026-08-15T12:00:00.000Z')).toBe('14:00'); // UTC+2
  });

  it('formats the long day heading in Malta time', () => {
    // The rolled-over date must be reflected in the heading too.
    expect(formatFixtureDayLong('2026-08-15T23:30:00.000Z')).toContain('16 August 2026');
  });
});
