import { describe, expect, it } from 'vitest';
import { formForTeam, parseClubMatch, standingForTeam } from '../src/clubmatch.js';

// A trimmed ESPN `summary` payload with the exact shapes the parser reads.
const SUMMARY = {
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { id: '359', displayName: 'Arsenal' } },
          { homeAway: 'away', team: { id: '388', displayName: 'Coventry City' } },
        ],
      },
    ],
  },
  pickcenter: [
    {
      provider: { name: 'DraftKings' },
      homeTeamOdds: { moneyLine: -700 },
      awayTeamOdds: { moneyLine: 1400 },
      drawOdds: { moneyLine: 650 },
      overUnder: 2.5,
      overOdds: -185,
      underOdds: 135,
    },
  ],
  lastFiveGames: [
    {
      team: { id: '359', displayName: 'Arsenal' },
      events: [
        {
          gameDate: '2026-05-10T15:30Z',
          gameResult: 'W',
          score: '1-0',
          opponent: { abbreviation: 'WHU' },
          leagueAbbreviation: 'Premier League',
          atVs: '@',
        },
      ],
    },
    { team: { id: '388', displayName: 'Coventry City' }, events: [] },
  ],
  headToHeadGames: [
    {
      team: { id: '359', displayName: 'Arsenal' },
      events: [
        {
          gameDate: '2014-01-24T19:45Z',
          competitionName: 'FA Cup',
          homeTeamId: '359',
          awayTeamId: '388',
          homeTeamScore: '4',
          awayTeamScore: '0',
          opponent: { displayName: 'Coventry City' },
        },
      ],
    },
  ],
  standings: {
    groups: [
      {
        standings: {
          entries: [
            {
              team: 'Coventry City',
              stats: [
                { type: 'rank', value: 14, displayValue: '14' },
                { type: 'points', value: 45, displayValue: '45' },
              ],
            },
            {
              team: 'Arsenal',
              stats: [
                { type: 'rank', value: 1, displayValue: '1' },
                { type: 'points', value: 80, displayValue: '80' },
                { type: 'gamesplayed', value: 38, displayValue: '38' },
                { type: 'total', displayValue: '25-5-8' },
              ],
            },
          ],
        },
      },
    ],
  },
};

describe('parseClubMatch', () => {
  const info = parseClubMatch(SUMMARY);

  it('de-vigs bookmaker odds into 1/X/2 probabilities + the O/U line', () => {
    expect(info.odds).not.toBeNull();
    const o = info.odds!;
    expect(o.homePct).toBe(81);
    expect(o.drawPct).toBe(12);
    expect(o.awayPct).toBe(6);
    expect(o.homePct).toBeGreaterThan(o.awayPct);
    expect(o.ouLine).toBe(2.5);
    expect(o.overPct).toBe(60);
  });

  it('reads recent form per team', () => {
    const arsenal = formForTeam(info, '359');
    expect(arsenal?.name).toBe('Arsenal');
    expect(arsenal?.games[0]).toMatchObject({
      result: 'W',
      score: '1-0',
      opponent: 'WHU',
      home: false,
    });
  });

  it('reads head-to-head history with dates and scores', () => {
    expect(info.h2h).toHaveLength(1);
    expect(info.h2h[0]).toMatchObject({
      competition: 'FA Cup',
      homeName: 'Arsenal',
      awayName: 'Coventry City',
      homeScore: 4,
      awayScore: 0,
    });
    expect(new Date(info.h2h[0]!.date).getUTCFullYear()).toBe(2014);
  });

  it('reads the league standings and finds a team position', () => {
    expect(info.standings.map((s) => s.rank)).toEqual([1, 14]); // sorted by rank
    expect(standingForTeam(info, 'Arsenal')).toMatchObject({ rank: 1, points: 80, played: 38 });
  });

  it('is defensive against an empty payload', () => {
    const empty = parseClubMatch({});
    expect(empty.odds).toBeNull();
    expect(empty.form).toEqual([]);
    expect(empty.h2h).toEqual([]);
    expect(empty.standings).toEqual([]);
  });
});
