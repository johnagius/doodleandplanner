import type { WcMatch, WcMatchEvent, WorldCupState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import type { WcLiveInfo } from '../../state/worldCupStore.js';
import { buildCommentary } from './wcCommentary.js';

const wc = {
  teams: [
    { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
    { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
  ],
  predictors: [],
  predictions: [],
  matches: [],
} as unknown as WorldCupState;

const match = {
  id: 'm1',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: '2026-06-20T16:00:00.000Z',
  homeId: 'AAA',
  awayId: 'BBB',
} as WcMatch;

describe('buildCommentary', () => {
  it('narrates goals with the running score, newest first, and a kick-off beat last', () => {
    const events: WcMatchEvent[] = [
      { minute: "23'", kind: 'goal', teamTla: 'AAA', player: 'Striker' },
      { minute: "50'", kind: 'goal', teamTla: 'BBB', player: 'Winger' },
    ];
    const live: WcLiveInfo = { status: 'IN_PLAY', minute: 60, home: 1, away: 1 };
    const lines = buildCommentary(wc, match, live, events);

    // Newest event first.
    expect(lines[0]?.text).toContain('Winger');
    expect(lines[0]?.tone).toBe('goal');
    // Running score tracked: Aland's goal made it 1–0.
    const aland = lines.find((l) => l.text.includes('Striker'));
    expect(aland?.text).toContain('Aland');
    expect(aland?.text).toContain('1');
    // Kick-off beat sits at the bottom of the ticker.
    expect(lines[lines.length - 1]?.id).toBe('ko');
  });

  it('adds a full-time beat at the top once resolved', () => {
    const resolved = { ...match, result: { home: 2, away: 1 } } as WcMatch;
    const lines = buildCommentary(wc, resolved, undefined, undefined);
    expect(lines[0]?.icon).toBe('🏁');
    expect(lines[0]?.text).toContain('Full time');
  });

  it('stays silent before kickoff — no faked "under way" line', () => {
    expect(buildCommentary(wc, match, undefined, undefined)).toHaveLength(0);
    // A scheduled feed entry (no minute/score yet) is still pre-match.
    const scheduled: WcLiveInfo = { status: 'SCHEDULED' } as unknown as WcLiveInfo;
    expect(buildCommentary(wc, match, scheduled, [])).toHaveLength(0);
  });

  it('reads the scoreline — an opener, then an equaliser', () => {
    const events: WcMatchEvent[] = [
      { minute: "10'", kind: 'goal', teamTla: 'AAA', player: 'Striker' },
      { minute: "20'", kind: 'goal', teamTla: 'BBB', player: 'Winger' },
    ];
    const live: WcLiveInfo = { status: 'IN_PLAY', minute: 25, home: 1, away: 1 };
    const lines = buildCommentary(wc, match, live, events);
    expect(lines.find((l) => l.text.includes('Striker'))?.text).toContain(
      'opens the scoring for Aland',
    );
    const eq = lines.find((l) => l.text.includes('Winger'))?.text ?? '';
    expect(eq).toContain('Equaliser!');
    expect(eq).toContain('levels it for Bland');
  });

  it('flags a brace and notes a penalty', () => {
    const events: WcMatchEvent[] = [
      { minute: "15'", kind: 'goal', teamTla: 'AAA', player: 'Striker' },
      { minute: "40'", kind: 'pen-goal', teamTla: 'AAA', player: 'Striker' },
    ];
    const live: WcLiveInfo = { status: 'IN_PLAY', minute: 45, home: 2, away: 0 };
    const second =
      buildCommentary(wc, match, live, events).find((l) => l.text.includes('second of the game'))
        ?.text ?? '';
    expect(second).toContain("Striker's second of the game");
    expect(second).toContain('from the penalty spot');
    expect(second).toContain("extends Aland's lead");
  });
});
