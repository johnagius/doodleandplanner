import { describe, expect, it } from 'vitest';
import { CLUB_SEASON_KICKOFF, posterCountdown } from './posterCountdown.js';

describe('posterCountdown', () => {
  it('counts 5 Malta calendar days from 11 August to the 16 August kick-off', () => {
    const c = posterCountdown(new Date('2026-08-11T12:00:00.000Z'));
    expect(c.daysToGo).toBe(5);
    expect(c.phase).toBe('countdown');
  });

  it('is calendar-day based: late on the 11th in Malta it is still 5 days', () => {
    // 20:59Z on the 11th = 22:59 Malta (CEST) — still the 11th locally.
    expect(posterCountdown(new Date('2026-08-11T20:59:00.000Z')).daysToGo).toBe(5);
    // 22:01Z on the 11th = 00:01 Malta on the 12th → 4 days to go.
    expect(posterCountdown(new Date('2026-08-11T22:01:00.000Z')).daysToGo).toBe(4);
  });

  it('reaches 1 day to go on the eve of kick-off', () => {
    const c = posterCountdown(new Date('2026-08-15T10:00:00.000Z'));
    expect(c.daysToGo).toBe(1);
    expect(c.phase).toBe('countdown');
  });

  it('flips to matchday on the opening day and to live afterwards', () => {
    // 08:00 Malta on Sunday 16 August.
    expect(posterCountdown(new Date('2026-08-16T06:00:00.000Z')).phase).toBe('today');
    expect(posterCountdown(new Date('2026-08-17T06:00:00.000Z')).phase).toBe('live');
  });

  it('splits the exact time left into d/h/m/s', () => {
    const kickoffMs = new Date(CLUB_SEASON_KICKOFF).getTime();
    const c = posterCountdown(new Date(kickoffMs - ((26 * 60 + 5) * 60 + 30) * 1000));
    expect(c.days).toBe(1);
    expect(c.hours).toBe(2);
    expect(c.minutes).toBe(5);
    expect(c.seconds).toBe(30);
  });

  it('never goes negative once the season has kicked off', () => {
    const c = posterCountdown(new Date('2026-09-01T00:00:00.000Z'));
    expect(c.phase).toBe('live');
    expect(c.days).toBe(0);
    expect(c.hours).toBe(0);
    expect(c.minutes).toBe(0);
    expect(c.seconds).toBe(0);
  });
});
