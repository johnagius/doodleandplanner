import type { WcLeaderRowMoved, WorldCupState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import { buildBroadcast } from './wcBroadcast.js';

const wc = {
  season: '2026',
  title: 'Test Cup',
  version: 1,
  teams: [
    { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
    { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
    { id: 'CCC', name: 'Cland', flag: '🇨', group: 'A' },
  ],
  matches: [
    {
      id: 'g-A-0',
      stage: 'group',
      group: 'A',
      matchday: 1,
      order: 0,
      kickoff: '2026-06-10T16:00:00.000Z',
      homeId: 'AAA',
      awayId: 'CCC',
      result: { home: 2, away: 0 },
    },
    {
      id: 'g-A-1',
      stage: 'group',
      group: 'A',
      matchday: 2,
      order: 1,
      kickoff: '2026-06-20T16:00:00.000Z',
      homeId: 'AAA',
      awayId: 'BBB',
    },
  ],
  predictors: [
    { id: 'p1', name: 'John' },
    { id: 'p2', name: 'Sara' },
  ],
  predictions: [
    {
      matchId: 'g-A-0',
      predictorId: 'p1',
      home: 2,
      away: 0,
      updatedAt: '2026-06-10T15:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  odds: { 'g-A-1': { homeML: -150, drawML: 250, awayML: 400 } },
} as unknown as WorldCupState;

const match = wc.matches[1]!;

const standings = [
  { predictorId: 'p1', name: 'John', points: 5, rank: 1, movement: 0 },
  { predictorId: 'p2', name: 'Sara', points: 2, rank: 2, movement: 1 },
] as unknown as WcLeaderRowMoved[];

describe('buildBroadcast', () => {
  const items = buildBroadcast(wc, match, undefined, standings);

  it('covers several kinds and never repeats a kind back-to-back', () => {
    expect(items.length).toBeGreaterThan(4);
    expect(new Set(items.map((i) => i.tone)).size).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.tone).not.toBe(items[i - 1]!.tone);
    }
  });

  it('reuses our standings to name the leader', () => {
    expect(items.some((i) => i.tone === 'board' && i.text.includes('John'))).toBe(true);
  });

  it('shows win probability from the match odds', () => {
    expect(items.some((i) => i.tone === 'stat' && i.text.includes('%'))).toBe(true);
  });

  it('reflects the group table', () => {
    expect(items.some((i) => i.tone === 'group' && i.text.includes('Group A'))).toBe(true);
  });

  it('counts who is still to pick before kickoff', () => {
    expect(items.some((i) => i.tone === 'info' && /picks?/i.test(i.text))).toBe(true);
  });
});
