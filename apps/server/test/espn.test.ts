import { describe, expect, it } from 'vitest';
import {
  espnDateWindow,
  mergeLiveScores,
  orientMatchSummary,
  parseEspnEventIds,
  parseEspnLineups,
  parseEspnMatchEvents,
  parseEspnNews,
  parseEspnScoreboard,
  parseEspnSummary,
} from '../src/espn.js';
import type { WcLiveScore } from '@dap/shared';

/** Build a minimal ESPN event the way the scoreboard returns them. */
function event(opts: {
  home: string;
  away: string;
  homeScore?: string;
  awayScore?: string;
  state?: 'pre' | 'in' | 'post';
  name?: string;
  completed?: boolean;
  displayClock?: string;
  shortDetail?: string;
  homeWinner?: boolean;
  awayWinner?: boolean;
  venue?: string;
  city?: string;
  country?: string;
  attendance?: number;
  overUnder?: number;
  oddsDetails?: string;
  homeML?: string;
  homeColor?: string;
  homeLogo?: string;
  id?: string;
}) {
  return {
    id: opts.id ?? `${opts.home}-${opts.away}`,
    competitions: [
      {
        status: {
          displayClock: opts.displayClock ?? "0'",
          type: {
            name: opts.name ?? 'STATUS_SCHEDULED',
            state: opts.state ?? 'pre',
            completed: opts.completed ?? false,
            description: 'x',
            shortDetail: opts.shortDetail ?? 'Scheduled',
          },
        },
        venue: {
          fullName: opts.venue ?? 'Some Stadium',
          address: { city: opts.city, country: opts.country },
        },
        attendance: opts.attendance,
        odds:
          opts.overUnder != null || opts.oddsDetails || opts.homeML
            ? [
                {
                  details: opts.oddsDetails,
                  overUnder: opts.overUnder,
                  moneyline: { home: { close: { odds: opts.homeML } } },
                },
              ]
            : undefined,
        competitors: [
          {
            homeAway: 'home',
            winner: !!opts.homeWinner,
            score: opts.homeScore ?? '0',
            team: { abbreviation: opts.home, color: opts.homeColor, logo: opts.homeLogo },
          },
          {
            homeAway: 'away',
            winner: !!opts.awayWinner,
            score: opts.awayScore ?? '0',
            team: { abbreviation: opts.away },
          },
        ],
      },
    ],
  };
}

describe('parseEspnScoreboard', () => {
  it('parses scheduled games with null scores and a venue', () => {
    const scores = parseEspnScoreboard({
      events: [event({ home: 'ESP', away: 'CPV', venue: 'Mercedes-Benz Stadium' })],
    });
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      homeTla: 'ESP',
      awayTla: 'CPV',
      status: 'SCHEDULED',
      minute: null,
      home: null,
      away: null,
      venue: 'Mercedes-Benz Stadium',
      source: 'espn',
    });
  });

  it('parses an in-play game with the live minute and score', () => {
    const [s] = parseEspnScoreboard({
      events: [
        event({
          home: 'BRA',
          away: 'SCO',
          state: 'in',
          name: 'STATUS_FIRST_HALF',
          homeScore: '2',
          awayScore: '1',
          displayClock: "37'",
          shortDetail: "37'",
        }),
      ],
    });
    expect(s).toMatchObject({ status: 'IN_PLAY', minute: 37, clock: "37'", home: 2, away: 1 });
  });

  it('reads stoppage time and half-time', () => {
    const [stoppage] = parseEspnScoreboard({
      events: [
        event({
          home: 'ARG',
          away: 'JOR',
          state: 'in',
          homeScore: '1',
          awayScore: '0',
          displayClock: "45'+2'",
        }),
      ],
    });
    expect(stoppage).toMatchObject({ minute: 45, clock: "45'+2'" });

    const [ht] = parseEspnScoreboard({
      events: [
        event({
          home: 'GER',
          away: 'ECU',
          state: 'in',
          name: 'STATUS_HALFTIME',
          homeScore: '0',
          awayScore: '0',
          shortDetail: 'HT',
        }),
      ],
    });
    expect(ht).toMatchObject({ status: 'PAUSED', minute: null, home: 0, away: 0, detail: 'HT' });
  });

  it('parses a finished game and a knockout penalty winner', () => {
    const [ft] = parseEspnScoreboard({
      events: [
        event({
          home: 'MEX',
          away: 'RSA',
          state: 'post',
          completed: true,
          homeScore: '2',
          awayScore: '1',
          homeWinner: true,
          shortDetail: 'FT',
        }),
      ],
    });
    expect(ft).toMatchObject({
      status: 'FINISHED',
      home: 2,
      away: 1,
      winner: 'HOME_TEAM',
      minute: null,
    });

    const [pens] = parseEspnScoreboard({
      events: [
        event({
          home: 'FRA',
          away: 'ENG',
          state: 'post',
          completed: true,
          homeScore: '1',
          awayScore: '1',
          awayWinner: true,
        }),
      ],
    });
    expect(pens).toMatchObject({ status: 'FINISHED', home: 1, away: 1, winner: 'AWAY_TEAM' });
  });

  it('captures attendance, venue location, team colours/logos and odds', () => {
    const [s] = parseEspnScoreboard({
      events: [
        event({
          home: 'ESP',
          away: 'CPV',
          state: 'post',
          completed: true,
          homeScore: '3',
          awayScore: '0',
          city: 'Atlanta, Georgia',
          country: 'USA',
          attendance: 70123,
          overUnder: 3.5,
          oddsDetails: 'ESP -1400',
          homeML: '-1400',
          homeColor: 'c60b1e',
          homeLogo: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png',
        }),
      ],
    });
    expect(s).toMatchObject({
      venue: 'Some Stadium',
      venueCity: 'Atlanta, Georgia, USA',
      attendance: 70123,
      homeColor: '#c60b1e',
      homeLogo: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png',
      odds: { details: 'ESP -1400', overUnder: 3.5, homeML: -1400 },
    });
  });

  it('leaves odds null when the feed has none', () => {
    const [s] = parseEspnScoreboard({ events: [event({ home: 'BRA', away: 'SCO' })] });
    expect(s?.odds ?? null).toBeNull();
    expect(s?.attendance ?? null).toBeNull();
  });

  it('drops events without two team codes', () => {
    const scores = parseEspnScoreboard({
      events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: {} }] }] }],
    });
    expect(scores).toHaveLength(0);
  });
});

describe('mergeLiveScores', () => {
  const fd = (over: Partial<WcLiveScore>): WcLiveScore => ({
    homeTla: 'ESP',
    awayTla: 'CPV',
    status: 'SCHEDULED',
    home: null,
    away: null,
    source: 'football-data',
    ...over,
  });

  it('overlays ESPN live data onto the football-data base', () => {
    const merged = mergeLiveScores(
      [fd({})],
      parseEspnScoreboard({
        events: [
          event({
            home: 'ESP',
            away: 'CPV',
            state: 'in',
            homeScore: '1',
            awayScore: '0',
            displayClock: "60'",
          }),
        ],
      }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      homeTla: 'ESP',
      awayTla: 'CPV',
      status: 'IN_PLAY',
      minute: 60,
      home: 1,
      away: 0,
      source: 'espn',
    });
  });

  it('maps the score by team code even if ESPN lists home/away the other way', () => {
    // football-data: ESP home, CPV away. ESPN: CPV home, ESP away, CPV 0 ESP 2.
    const [merged] = mergeLiveScores(
      [fd({})],
      parseEspnScoreboard({
        events: [
          event({
            home: 'CPV',
            away: 'ESP',
            state: 'in',
            homeScore: '0',
            awayScore: '2',
            displayClock: "70'",
          }),
        ],
      }),
    );
    expect(merged).toMatchObject({ homeTla: 'ESP', awayTla: 'CPV', home: 2, away: 0 });
  });

  it('keeps a football-data FINISHED result rather than un-finalising it', () => {
    const [merged] = mergeLiveScores(
      [fd({ status: 'FINISHED', home: 2, away: 0, winner: 'HOME_TEAM' })],
      parseEspnScoreboard({
        events: [event({ home: 'ESP', away: 'CPV', state: 'in', homeScore: '1', awayScore: '0' })],
      }),
    );
    expect(merged).toMatchObject({ status: 'FINISHED', home: 2, away: 0, source: 'football-data' });
  });

  it('enriches a finished football-data game with ESPN metadata (attendance, odds)', () => {
    const [merged] = mergeLiveScores(
      [fd({ status: 'FINISHED', home: 3, away: 0, winner: 'HOME_TEAM' })],
      parseEspnScoreboard({
        events: [
          event({
            home: 'ESP',
            away: 'CPV',
            state: 'post',
            completed: true,
            homeScore: '3',
            awayScore: '0',
            attendance: 70123,
            overUnder: 3.5,
            oddsDetails: 'ESP -1400',
          }),
        ],
      }),
    );
    // Official score/source preserved, but now carries the crowd + odds.
    expect(merged).toMatchObject({
      status: 'FINISHED',
      home: 3,
      away: 0,
      source: 'football-data',
      attendance: 70123,
      odds: { overUnder: 3.5 },
    });
  });

  it('appends ESPN-only games when football-data is empty or lagging', () => {
    const merged = mergeLiveScores(
      [],
      parseEspnScoreboard({
        events: [event({ home: 'URU', away: 'KSA', state: 'in', homeScore: '0', awayScore: '0' })],
      }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ homeTla: 'URU', awayTla: 'KSA', status: 'IN_PLAY' });
  });
});

describe('parseEspnMatchEvents', () => {
  const key = (a: string, b: string) => [a, b].sort().join('|');

  it('extracts goals (with assists) and cards, keyed by team pair, skipping subs', () => {
    const raw = {
      events: [
        {
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: '203', abbreviation: 'MEX' } },
                { homeAway: 'away', team: { id: '467', abbreviation: 'RSA' } },
              ],
              details: [
                { type: { text: 'Goal' }, clock: { displayValue: "9'" }, team: { id: '203' }, scoringPlay: true, athletesInvolved: [{ displayName: 'Julián Quiñones' }, { displayName: 'Hirving Lozano' }] }, // prettier-ignore
                { type: { text: 'Yellow Card' }, clock: { displayValue: "17'" }, team: { id: '467' }, yellowCard: true, athletesInvolved: [{ displayName: 'Teboho Mokoena' }] }, // prettier-ignore
                { type: { text: 'Red Card' }, clock: { displayValue: "49'" }, team: { id: '467' }, redCard: true, athletesInvolved: [{ displayName: 'Sphephelo Sithole' }] }, // prettier-ignore
                { type: { text: 'Substitution' }, clock: { displayValue: "60'" }, team: { id: '203' }, athletesInvolved: [{ displayName: 'Sub Guy' }] }, // prettier-ignore
              ],
            },
          ],
        },
      ],
    };
    const list = parseEspnMatchEvents(raw)[key('MEX', 'RSA')]!;
    expect(list).toHaveLength(3); // substitution skipped
    expect(list[0]).toEqual({ minute: "9'", kind: 'goal', teamTla: 'MEX', player: 'Julián Quiñones', assist: 'Hirving Lozano' }); // prettier-ignore
    expect(list[1]).toMatchObject({ kind: 'yellow', teamTla: 'RSA', player: 'Teboho Mokoena' });
    expect(list[2]).toMatchObject({ kind: 'red', teamTla: 'RSA', player: 'Sphephelo Sithole' });
  });

  it('classifies penalty and own goals', () => {
    const raw = {
      events: [
        {
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: '1', abbreviation: 'BRA' } },
                { homeAway: 'away', team: { id: '2', abbreviation: 'SCO' } },
              ],
              details: [
                { team: { id: '1' }, scoringPlay: true, penaltyKick: true, clock: { displayValue: "30'" }, athletesInvolved: [{ displayName: 'Neymar' }] }, // prettier-ignore
                { team: { id: '2' }, scoringPlay: true, ownGoal: true, clock: { displayValue: "80'" }, athletesInvolved: [{ displayName: 'Hapless Defender' }] }, // prettier-ignore
              ],
            },
          ],
        },
      ],
    };
    const list = parseEspnMatchEvents(raw)[key('BRA', 'SCO')]!;
    expect(list[0]!.kind).toBe('pen-goal');
    expect(list[1]!.kind).toBe('own-goal');
  });
});

describe('parseEspnLineups + parseEspnEventIds', () => {
  it('parses starting XIs keyed by team code', () => {
    const out = parseEspnLineups({
      rosters: [
        {
          team: { abbreviation: 'MEX' },
          roster: [
            { athlete: { displayName: 'Raúl Rangel' }, jersey: '1', starter: true, position: { abbreviation: 'G' }, formationPlace: '1' }, // prettier-ignore
            { displayName: 'Johan Vásquez', jersey: '5', starter: true, position: { abbreviation: 'CD-L' }, formationPlace: '6' }, // prettier-ignore
            { displayName: 'Bench Guy', jersey: '13', starter: false, position: { abbreviation: 'ST' } }, // prettier-ignore
          ],
        },
        { team: { abbreviation: 'RSA' }, roster: [{ displayName: 'Keeper', jersey: '1', starter: true, position: { abbreviation: 'G' } }] }, // prettier-ignore
      ],
    });
    expect(Object.keys(out).sort()).toEqual(['MEX', 'RSA']);
    expect(out.MEX).toHaveLength(3);
    expect(out.MEX![0]).toEqual({ name: 'Raúl Rangel', jersey: 1, pos: 'G', starter: true, formationPlace: 1 }); // prettier-ignore
    expect(out.MEX![1]).toMatchObject({ name: 'Johan Vásquez', pos: 'CD-L', starter: true });
  });

  it('keys event ids by the sorted team pair', () => {
    const ids = parseEspnEventIds({
      events: [
        { id: 760415, competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'MEX' } }, { homeAway: 'away', team: { abbreviation: 'RSA' } }] }] }, // prettier-ignore
      ],
    });
    expect(ids[['MEX', 'RSA'].sort().join('|')]).toBe('760415');
  });
});

describe('parseEspnSummary + orientMatchSummary', () => {
  const summary = {
    boxscore: {
      teams: [
        {
          homeAway: 'home',
          team: { abbreviation: 'USA' },
          statistics: [
            { name: 'possessionPct', value: 74.6, displayValue: '74.6' },
            { name: 'totalShots', value: 12, displayValue: '12' },
            { name: 'shotsOnTarget', value: 5, displayValue: '5' },
            { name: 'wonCorners', value: 7, displayValue: '7' },
            { name: 'foulsCommitted', value: 9, displayValue: '9' },
            { name: 'offsides', value: 2, displayValue: '2' },
            { name: 'passPct', value: 88, displayValue: '88' },
            { name: 'saves', value: 1, displayValue: '1' },
            { name: 'totalTackles', value: 14, displayValue: '14' },
          ],
        },
        {
          homeAway: 'away',
          team: { abbreviation: 'AUS' },
          statistics: [
            { name: 'possessionPct', displayValue: '25.4' }, // value missing → parse displayValue
            { name: 'totalShots', value: 4 },
            { name: 'shotsOnTarget', value: 1 },
            { name: 'passPct', value: 71 },
          ],
        },
      ],
    },
    leaders: [
      {
        team: { abbreviation: 'USA' },
        leaders: [
          {
            displayName: 'Total Shots',
            leaders: [
              { displayValue: '4', athlete: { displayName: 'Sergiño Dest' } },
              { displayValue: '2', athlete: { displayName: 'Someone Else' } }, // not the top → dropped
            ],
          },
          {
            displayName: 'Saves',
            leaders: [{ value: 1, athlete: { displayName: 'Matt Turner' } }],
          },
        ],
      },
      {
        team: { abbreviation: 'AUS' },
        leaders: [
          {
            displayName: 'Total Shots',
            leaders: [{ displayValue: '2', athlete: { displayName: 'Mat Ryan' } }],
          },
        ],
      },
    ],
    lastFiveGames: [
      {
        team: { abbreviation: 'USA' },
        events: [
          { gameDate: '2026-03-28T19:30Z', opponent: { abbreviation: 'BEL', displayName: 'Belgium' }, score: '2-5', atVs: 'vs', gameResult: 'L', competitionName: '2026 International Friendly' }, // prettier-ignore
          { gameDate: '2026-03-25T19:30Z', opponent: { abbreviation: 'CAN', displayName: 'Canada' }, score: '3-1', atVs: '@', gameResult: 'W' }, // prettier-ignore
          { opponent: { abbreviation: 'MEX' }, gameResult: 'X' }, // unknown result → dropped
        ],
      },
    ],
    gameInfo: {
      officials: [
        { fullName: 'Assistant One', position: { name: 'Assistant Referee 1' } },
        { fullName: 'Felix Zwayer', displayName: 'Felix Zwayer', position: { name: 'Referee', id: '1' } }, // prettier-ignore
      ],
      venue: { fullName: 'Lumen Field', address: { city: 'Seattle, Washington', country: 'USA' } },
    },
  };

  it('parses team stats, top performers, referee and venue', () => {
    const p = parseEspnSummary(summary);
    expect(p.teamStats.USA?.possessionPct).toBe(74.6);
    expect(p.teamStats.AUS?.possessionPct).toBe(25.4); // from displayValue when value is missing
    expect(p.referee).toBe('Felix Zwayer'); // picked by position, not list order
    expect(p.venue).toBe('Lumen Field');
    expect(p.venueCity).toBe('Seattle, Washington, USA');
    // Only the top athlete per category, with the team code attached.
    const usaShots = p.leaders.find((l) => l.teamTla === 'USA' && l.category === 'Total Shots');
    expect(usaShots).toMatchObject({ name: 'Sergiño Dest', value: '4' });
    expect(p.leaders.some((l) => l.name === 'Someone Else')).toBe(false);
    expect(p.leaders.find((l) => l.category === 'Saves')).toMatchObject({ name: 'Matt Turner', value: '1' }); // prettier-ignore
    // Recent form: only events with a real W/D/L result, home/away from atVs.
    expect(p.lastFive.USA).toHaveLength(2);
    expect(p.lastFive.USA![0]).toMatchObject({ opponentTla: 'BEL', result: 'L', score: '2-5', home: true }); // prettier-ignore
    expect(p.lastFive.USA![1]).toMatchObject({ opponentTla: 'CAN', result: 'W', home: false });
  });

  it('orients stats to the board home/away, mirroring when flipped', () => {
    const p = parseEspnSummary(summary);
    const s = orientMatchSummary(p, 'USA', 'AUS');
    expect(s.homeTla).toBe('USA');
    expect(s.stats.find((r) => r.key === 'possession')).toMatchObject({ home: 74.6, away: 25.4, pct: true }); // prettier-ignore
    expect(s.stats.find((r) => r.key === 'shots')).toMatchObject({ home: 12, away: 4, pct: false });
    // USA has corners, AUS doesn't — the row still shows with a null for AUS.
    expect(s.stats.find((r) => r.key === 'corners')).toMatchObject({ home: 7, away: null });
    // Flipping the orientation swaps the two sides.
    const flipped = orientMatchSummary(p, 'AUS', 'USA');
    expect(flipped.stats.find((r) => r.key === 'shots')).toMatchObject({ home: 4, away: 12 });
    // Recent form is oriented to the board's home/away too.
    expect(s.recent.home).toHaveLength(2);
    expect(s.recent.away).toHaveLength(0);
    expect(flipped.recent.away).toHaveLength(2);
  });

  it('drops a stat row that neither side reports', () => {
    const p = parseEspnSummary({
      boxscore: {
        teams: [
          { team: { abbreviation: 'USA' }, statistics: [{ name: 'totalShots', value: 3 }] },
          { team: { abbreviation: 'AUS' }, statistics: [{ name: 'totalShots', value: 1 }] },
        ],
      },
    });
    const s = orientMatchSummary(p, 'USA', 'AUS');
    expect(s.stats.map((r) => r.key)).toEqual(['shots']);
    expect(s.leaders).toEqual([]);
    expect(s.referee).toBeNull();
    expect(s.venue).toBeNull();
  });

  it('is unfazed by an empty or junk payload', () => {
    const p = parseEspnSummary({});
    expect(p.teamStats).toEqual({});
    expect(orientMatchSummary(p, 'USA', 'AUS').stats).toEqual([]);
    expect(parseEspnSummary(null).leaders).toEqual([]);
  });
});

describe('parseEspnNews', () => {
  it('maps articles to headline/url/image and drops incomplete ones', () => {
    const out = parseEspnNews({
      articles: [
        {
          headline: 'USMNT roll into the last 16',
          description: 'A statement win.',
          published: '2026-06-19T21:18:30Z',
          links: { web: { href: 'https://espn.com/story/1' } },
          images: [{ url: 'https://a.espncdn.com/photo/1.jpg' }],
        },
        { headline: 'No link here', images: [] }, // no url → dropped
        { description: 'No headline', links: { web: { href: 'https://espn.com/story/2' } } }, // dropped
        {
          headline: 'Mobile-only link, no image',
          links: { mobile: { href: 'https://m.espn.com/story/3' } },
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      headline: 'USMNT roll into the last 16',
      description: 'A statement win.',
      published: '2026-06-19T21:18:30Z',
      url: 'https://espn.com/story/1',
      image: 'https://a.espncdn.com/photo/1.jpg',
    });
    expect(out[1]).toMatchObject({ url: 'https://m.espn.com/story/3', image: null });
  });

  it('is unfazed by an empty or junk payload', () => {
    expect(parseEspnNews({})).toEqual([]);
    expect(parseEspnNews(null)).toEqual([]);
  });
});

describe('espnDateWindow', () => {
  it('returns yesterday, today and tomorrow as UTC YYYYMMDD', () => {
    expect(espnDateWindow(new Date('2026-06-15T23:30:00Z'))).toEqual([
      '20260614',
      '20260615',
      '20260616',
    ]);
  });
});
