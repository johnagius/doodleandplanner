import type { WcMatchStatRow } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import { statBarPercents } from './matchSummary.js';

const row = (over: Partial<WcMatchStatRow>): WcMatchStatRow => ({
  key: 'x',
  label: 'X',
  home: null,
  away: null,
  pct: false,
  ...over,
});

describe('statBarPercents', () => {
  it('splits a count stat by its share of the two totals', () => {
    expect(statBarPercents(row({ home: 12, away: 4 }))).toEqual({ home: 75, away: 25 });
  });

  it('shows each side own value for a percentage stat', () => {
    // Possession-style: each bar reflects its own %, not a 52/48 share.
    expect(statBarPercents(row({ home: 85, away: 78, pct: true }))).toEqual({ home: 85, away: 78 });
  });

  it('treats a missing side as zero', () => {
    expect(statBarPercents(row({ home: 7, away: null }))).toEqual({ home: 100, away: 0 });
  });

  it('is empty when neither side has a value', () => {
    expect(statBarPercents(row({ home: 0, away: 0 }))).toEqual({ home: 0, away: 0 });
    expect(statBarPercents(row({}))).toEqual({ home: 0, away: 0 });
  });

  it('clamps stray percentages into 0–100', () => {
    expect(statBarPercents(row({ home: 140, away: -5, pct: true }))).toEqual({
      home: 100,
      away: 0,
    });
  });
});
