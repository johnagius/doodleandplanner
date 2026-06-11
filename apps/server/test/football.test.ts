import { describe, expect, it } from 'vitest';
import { mapWorldCupScores } from '../src/football.js';
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

describe('route: live scores', () => {
  it('routes GET /api/football/worldcup', () => {
    expect(route('GET', '/api/football/worldcup')).toEqual({ kind: 'wc-scores' });
    expect(route('POST', '/api/football/worldcup')).toEqual({ kind: 'not-found' });
  });
});
