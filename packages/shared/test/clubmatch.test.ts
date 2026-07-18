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
    expect(empty.lineups).toEqual([]);
    expect(empty.stats).toEqual([]);
    expect(empty.keyEvents).toEqual([]);
    expect(empty.news).toEqual([]);
  });
});

const COMPLETED = {
  rosters: [
    {
      homeAway: 'home',
      team: { id: '359', displayName: 'Arsenal' },
      formation: '4-3-3',
      roster: [
        {
          starter: true,
          jersey: '1',
          athlete: { displayName: 'Keeper' },
          position: { abbreviation: 'G' },
        },
        {
          starter: false,
          jersey: '30',
          athlete: { displayName: 'Benchwarmer' },
          position: { abbreviation: 'M' },
        },
      ],
    },
    {
      homeAway: 'away',
      team: { id: '388', displayName: 'Coventry City' },
      formation: '4-4-2',
      roster: [],
    },
  ],
  boxscore: {
    teams: [
      {
        homeAway: 'home',
        statistics: [
          { name: 'possessionPct', displayValue: '61.2' },
          { name: 'totalShots', displayValue: '15' },
        ],
      },
      {
        homeAway: 'away',
        statistics: [
          { name: 'possessionPct', displayValue: '38.8' },
          { name: 'totalShots', displayValue: '6' },
        ],
      },
    ],
  },
  keyEvents: [
    {
      clock: { displayValue: "23'" },
      text: 'Goal! Arsenal 1, Coventry 0.',
      type: { text: 'Goal' },
      scoringPlay: true,
    },
    { clock: { displayValue: "45'" }, text: 'First Half ends.', type: { text: 'Halftime' } },
    { clock: { displayValue: "67'" }, text: 'Booking.', type: { text: 'Yellow Card' } },
  ],
  news: {
    articles: [
      {
        headline: 'Match report',
        published: '2026-08-16T18:00Z',
        links: { web: { href: 'https://espn.com/x' } },
      },
    ],
  },
};

describe('parseClubMatch — completed match', () => {
  const info = parseClubMatch(COMPLETED);

  it('reads line-ups with formation, starters and subs', () => {
    const home = info.lineups.find((l) => l.homeAway === 'home')!;
    expect(home.formation).toBe('4-3-3');
    expect(home.starters.map((p) => p.name)).toEqual(['Keeper']);
    expect(home.subs.map((p) => p.name)).toEqual(['Benchwarmer']);
  });

  it('pairs home/away match stats', () => {
    const poss = info.stats.find((s) => s.label === 'Possession %')!;
    expect(poss).toMatchObject({ home: '61.2', away: '38.8' });
    expect(info.stats.find((s) => s.label === 'Shots')).toMatchObject({ home: '15', away: '6' });
  });

  it('keeps only meaningful key events (goals/cards/subs), not kickoff/halftime', () => {
    expect(info.keyEvents.map((e) => e.type)).toEqual(['Goal', 'Yellow Card']);
    expect(info.keyEvents[0]).toMatchObject({ minute: "23'", scoring: true });
  });

  it('reads news headlines with links', () => {
    expect(info.news).toHaveLength(1);
    expect(info.news[0]).toMatchObject({ headline: 'Match report', url: 'https://espn.com/x' });
  });
});
