import type { WcMatch, WcMatchEvent, WcMatchSummary, WorldCupState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import { buildIntervalReport, goalLabel, intervalPhase, statValue } from './intervalReport.js';

const wc = {
  teams: [
    { id: 'ENG', name: 'England', flag: '🏴', group: 'A' },
    { id: 'ESP', name: 'Spain', flag: '🇪🇸', group: 'A' },
  ],
} as unknown as WorldCupState;

const match = {
  id: 'm1',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: '2026-06-20T18:00:00Z',
  homeId: 'ENG',
  awayId: 'ESP',
} as WcMatch;

function ev(partial: Partial<WcMatchEvent>): WcMatchEvent {
  return { minute: "10'", kind: 'goal', teamTla: 'ENG', player: 'X', ...partial };
}

describe('intervalPhase', () => {
  it('is half time when paused, full time when finished or resulted, else null', () => {
    expect(intervalPhase({ status: 'PAUSED' }, undefined)).toBe('ht');
    expect(intervalPhase({ status: 'FINISHED' }, undefined)).toBe('ft');
    expect(intervalPhase({ status: 'IN_PLAY' }, { home: 1, away: 0 })).toBe('ft');
    expect(intervalPhase({ status: 'IN_PLAY' }, undefined)).toBeNull();
    expect(intervalPhase(undefined, undefined)).toBeNull();
  });
});

describe('buildIntervalReport', () => {
  it('returns null when the match is mid-half', () => {
    expect(buildIntervalReport(wc, match, { status: 'IN_PLAY' }, [], null)).toBeNull();
  });

  it('groups scorers per side at half time', () => {
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'PAUSED', home: 1, away: 0 },
      [ev({ minute: "23'", player: 'Kane', teamTla: 'ENG' })],
      null,
    );
    expect(data).not.toBeNull();
    expect(data!.phase).toBe('ht');
    expect(data!.label).toBe('Half Time');
    expect(data!.home.score).toBe(1);
    expect(data!.away.score).toBe(0);
    expect(data!.home.goals).toHaveLength(1);
    expect(data!.home.goals[0]!.player).toBe('Kane');
    expect(data!.away.goals).toHaveLength(0);
    expect(data!.stats).toHaveLength(0);
    // No verdict at the half — it isn't over yet.
    expect(data!.verdict).toBeNull();
  });

  it('credits own goals to the other side and labels pens/OGs, sorted by minute', () => {
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'PAUSED', home: 1, away: 2 },
      [
        ev({ minute: "67'", kind: 'pen-goal', player: 'Morata', teamTla: 'ESP' }),
        ev({ minute: "31'", kind: 'own-goal', player: 'Maguire', teamTla: 'ENG' }),
        ev({ minute: "23'", player: 'Kane', teamTla: 'ENG' }),
      ],
      null,
    );
    // ENG scored once (Kane); the own goal by ENG's Maguire credits ESP.
    expect(data!.home.goals.map((g) => g.player)).toEqual(['Kane']);
    expect(data!.away.goals.map((g) => g.player)).toEqual(['Maguire', 'Morata']);
    expect(goalLabel(data!.away.goals[0]!)).toBe("Maguire (OG) 31'");
    expect(goalLabel(data!.away.goals[1]!)).toBe("Morata (pen) 67'");
  });

  it('prefers the official result over the live score at full time', () => {
    const data = buildIntervalReport(
      { ...wc, matches: [] } as unknown as WorldCupState,
      { ...match, result: { home: 2, away: 1 } } as WcMatch,
      { status: 'FINISHED', home: 9, away: 9 },
      [],
      null,
    );
    expect(data!.phase).toBe('ft');
    expect(data!.label).toBe('Full Time');
    expect(data!.home.score).toBe(2);
    expect(data!.away.score).toBe(1);
    expect(data!.verdict).toEqual({ winner: 'home', text: 'England win' });
  });

  it('calls a draw "Honours even" and names the away winner', () => {
    const draw = buildIntervalReport(wc, match, { status: 'FINISHED', home: 1, away: 1 }, [], null);
    expect(draw!.verdict).toEqual({ winner: null, text: 'Honours even' });
    const awayWin = buildIntervalReport(
      wc,
      match,
      { status: 'FINISHED', home: 0, away: 2 },
      [],
      null,
    );
    expect(awayWin!.verdict).toEqual({ winner: 'away', text: 'Spain win' });
  });

  it('names the highest-rated player across both sides as the star', () => {
    const summary = {
      homeTla: 'ENG',
      awayTla: 'ESP',
      stats: [],
      leaders: [
        { teamTla: 'ENG', category: 'Rating', name: 'Bellingham', value: '8.4' },
        { teamTla: 'ESP', category: 'Rating', name: 'Pedri', value: '7.9' },
        { teamTla: 'ENG', category: 'Goals', name: 'Kane', value: '1' },
      ],
      recent: { home: [], away: [] },
      referee: null,
      venue: null,
      venueCity: null,
    } as WcMatchSummary;
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'FINISHED', home: 1, away: 0 },
      [],
      summary,
    );
    expect(data!.star).toEqual({ name: 'Bellingham', teamTla: 'ENG', note: 'Rating 8.4' });
  });

  it('falls back to the leading scorer (pens count) when there are no ratings', () => {
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'FINISHED', home: 2, away: 1 },
      [
        ev({ minute: "12'", player: 'Kane', teamTla: 'ENG' }),
        ev({ minute: "40'", player: 'Kane', teamTla: 'ENG' }),
        ev({ minute: "70'", kind: 'pen-goal', player: 'Morata', teamTla: 'ESP' }),
      ],
      null,
    );
    expect(data!.star).toEqual({ name: 'Kane', teamTla: 'ENG', note: '2 goals' });
  });

  it('has no star with neither ratings nor goals', () => {
    const data = buildIntervalReport(wc, match, { status: 'PAUSED', home: 0, away: 0 }, [], null);
    expect(data!.star).toBeNull();
  });

  it('builds a referee / venue / attendance footnote', () => {
    const summary = {
      homeTla: 'ENG',
      awayTla: 'ESP',
      stats: [],
      leaders: [],
      recent: { home: [], away: [] },
      referee: 'M. Oliver',
      venue: 'Wembley Stadium',
      venueCity: 'London, England',
    } as WcMatchSummary;
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'FINISHED', home: 1, away: 0, attendance: 84000 },
      [],
      summary,
    );
    expect(data!.meta).toEqual([
      '🧑‍⚖️ M. Oliver',
      '📍 Wembley Stadium, London, England',
      '👥 84,000',
    ]);
  });

  it('omits the footnote when there is no detail', () => {
    const data = buildIntervalReport(wc, match, { status: 'PAUSED', home: 0, away: 0 }, [], null);
    expect(data!.meta).toEqual([]);
  });

  it('surfaces the headline stats, dropping unknown or empty rows', () => {
    const summary = {
      homeTla: 'ENG',
      awayTla: 'ESP',
      stats: [
        { key: 'possession', label: 'Possession', home: 58, away: 42, pct: true },
        { key: 'shots', label: 'Shots', home: 7, away: 3, pct: false },
        { key: 'onTarget', label: 'Shots on target', home: null, away: 1, pct: false },
        { key: 'fouls', label: 'Fouls', home: 8, away: 11, pct: false },
      ],
      leaders: [],
      recent: { home: [], away: [] },
      referee: null,
      venue: null,
      venueCity: null,
    } as WcMatchSummary;
    const data = buildIntervalReport(
      wc,
      match,
      { status: 'PAUSED', home: 0, away: 0 },
      [],
      summary,
    );
    // onTarget dropped (null), fouls dropped (not headline) → possession + shots.
    expect(data!.stats.map((s) => s.label)).toEqual(['Possession', 'Shots']);
    const possession = data!.stats[0]!;
    expect(possession.homePct).toBe(58);
    expect(possession.awayPct).toBe(42);
    expect(statValue(possession, 'home')).toBe('58%');
    const shots = data!.stats[1]!;
    expect(shots.homePct).toBeCloseTo(70);
    expect(shots.awayPct).toBeCloseTo(30);
    expect(statValue(shots, 'away')).toBe('3');
  });
});
