import { describe, expect, it } from 'vitest';
import { espnDateWindow, mergeLiveScores, parseEspnScoreboard } from '../src/espn.js';
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

describe('espnDateWindow', () => {
  it('returns yesterday, today and tomorrow as UTC YYYYMMDD', () => {
    expect(espnDateWindow(new Date('2026-06-15T23:30:00Z'))).toEqual([
      '20260614',
      '20260615',
      '20260616',
    ]);
  });
});
