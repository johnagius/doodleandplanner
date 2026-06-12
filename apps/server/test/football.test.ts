import { describe, expect, it } from 'vitest';
import { findWcMatch, mapHeadToHead, mapWorldCupScores } from '../src/football.js';
import { route } from '../src/router.js';

describe('mapWorldCupScores', () => {
  it('maps full-time scores and tla codes, dropping teamless rows', () => {
    const raw = {
      matches: [
        {
          status: 'FINISHED',
          minute: null,
          homeTeam: { tla: 'MEX' },
          awayTeam: { tla: 'RSA' },
          score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
        },
        {
          status: 'TIMED',
          homeTeam: { tla: 'KOR' },
          awayTeam: { tla: 'CZE' },
          score: { winner: null, fullTime: { home: null, away: null } },
        },
        { status: 'TIMED', homeTeam: {}, awayTeam: { tla: 'X' } }, // dropped: no home tla
      ],
    };
    const scores = mapWorldCupScores(raw);
    expect(scores).toHaveLength(2);
    expect(scores[0]).toEqual({
      homeTla: 'MEX',
      awayTla: 'RSA',
      status: 'FINISHED',
      minute: null,
      home: 2,
      away: 1,
      winner: 'HOME_TEAM',
    });
    expect(scores[1]).toMatchObject({ homeTla: 'KOR', awayTla: 'CZE', home: null, away: null });
  });

  it('tolerates malformed input', () => {
    expect(mapWorldCupScores(null)).toEqual([]);
    expect(mapWorldCupScores({})).toEqual([]);
    expect(mapWorldCupScores({ matches: 'nope' })).toEqual([]);
  });
});

describe('findWcMatch', () => {
  const raw = {
    matches: [
      { id: 11, homeTeam: { tla: 'MEX' }, awayTeam: { tla: 'RSA' } },
      { id: 22, homeTeam: { tla: 'KOR' }, awayTeam: { tla: 'CZE' } },
    ],
  };
  it('finds a match by tla pair in either order, returning the feed ordering', () => {
    expect(findWcMatch(raw, 'MEX', 'RSA')).toEqual({ id: 11, homeTla: 'MEX', awayTla: 'RSA' });
    expect(findWcMatch(raw, 'RSA', 'MEX')).toEqual({ id: 11, homeTla: 'MEX', awayTla: 'RSA' });
  });
  it('returns null when there is no such fixture', () => {
    expect(findWcMatch(raw, 'MEX', 'KOR')).toBeNull();
    expect(findWcMatch(null, 'MEX', 'RSA')).toBeNull();
  });
});

describe('mapHeadToHead', () => {
  it('keys aggregate records by tla and maps recent meetings', () => {
    const raw = {
      aggregates: {
        numberOfMatches: 3,
        homeTeam: { wins: 2, draws: 1, losses: 0 },
        awayTeam: { wins: 0, draws: 1, losses: 2 },
      },
      matches: [
        {
          utcDate: '2022-06-01T00:00:00Z',
          homeTeam: { tla: 'MEX' },
          awayTeam: { tla: 'RSA' },
          competition: { name: 'Friendly' },
          score: { fullTime: { home: 2, away: 1 } },
        },
      ],
    };
    const h2h = mapHeadToHead(raw, 'MEX', 'RSA')!;
    expect(h2h.numberOfMatches).toBe(3);
    expect(h2h.records.MEX).toEqual({ wins: 2, draws: 1, losses: 0 });
    expect(h2h.records.RSA).toEqual({ wins: 0, draws: 1, losses: 2 });
    expect(h2h.recent[0]).toMatchObject({
      homeTla: 'MEX',
      awayTla: 'RSA',
      homeScore: 2,
      awayScore: 1,
      competition: 'Friendly',
    });
  });
  it('returns null without aggregates', () => {
    expect(mapHeadToHead({}, 'MEX', 'RSA')).toBeNull();
    expect(mapHeadToHead(null, 'A', 'B')).toBeNull();
  });
});

describe('route: live scores + head-to-head', () => {
  it('routes the football endpoints', () => {
    expect(route('GET', '/api/football/worldcup')).toEqual({ kind: 'wc-scores' });
    expect(route('POST', '/api/football/worldcup')).toEqual({ kind: 'not-found' });
    expect(route('GET', '/api/football/h2h')).toEqual({ kind: 'wc-h2h' });
    expect(route('POST', '/api/football/h2h')).toEqual({ kind: 'not-found' });
  });
});
