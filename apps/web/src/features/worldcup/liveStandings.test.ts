import type { WorldCupState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import type { WcLiveInfo } from '../../state/worldCupStore.js';
import { liveScoresFromLive } from './liveStandings.js';

function info(partial: Partial<WcLiveInfo>): WcLiveInfo {
  return { status: 'IN_PLAY', minute: 30, home: 0, away: 0, ...partial };
}

const wc = {
  matches: [
    { id: 'open', result: undefined },
    { id: 'done', result: { home: 2, away: 1 } },
  ],
} as unknown as WorldCupState;

describe('liveScoresFromLive', () => {
  it('includes only in-play matches that have a score and no final result', () => {
    const scores = liveScoresFromLive(wc, {
      open: info({ home: 1, away: 2 }),
      done: info({ home: 1, away: 0 }), // already resulted → excluded
      missing: info({ home: 3, away: 3 }), // not on the board → excluded
    });
    expect(scores).toEqual({ open: { home: 1, away: 2 } });
  });

  it('excludes matches that are not in play or have no numbers yet', () => {
    const scores = liveScoresFromLive(wc, {
      open: info({ status: 'FINISHED', home: 1, away: 1 }),
    });
    expect(scores).toEqual({});

    const noNumbers = liveScoresFromLive(wc, { open: info({ home: null, away: null }) });
    expect(noNumbers).toEqual({});
  });
});
