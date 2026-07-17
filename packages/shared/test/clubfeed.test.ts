import { describe, expect, it } from 'vitest';
import {
  clubFeedWindow,
  clubScoreboardUrl,
  mergeClubFeeds,
  parseClubScoreboard,
} from '../src/clubfeed.js';

/** A minimal ESPN scoreboard payload in the shape the parser reads. */
function scoreboard(events: unknown[]) {
  return { events };
}

function event(opts: {
  id: string;
  date: string;
  homeId?: string;
  homeName: string;
  homeAbbr: string;
  awayId?: string;
  awayName: string;
  awayAbbr: string;
  state: 'pre' | 'in' | 'post';
  completed?: boolean;
  homeScore?: string;
  awayScore?: string;
}) {
  return {
    id: opts.id,
    date: opts.date,
    competitions: [
      {
        competitors: [
          {
            homeAway: 'home',
            team: { id: opts.homeId, displayName: opts.homeName, abbreviation: opts.homeAbbr },
            score: opts.homeScore,
          },
          {
            homeAway: 'away',
            team: { id: opts.awayId, displayName: opts.awayName, abbreviation: opts.awayAbbr },
            score: opts.awayScore,
          },
        ],
        status: { type: { state: opts.state, completed: opts.completed } },
      },
    ],
  };
}

describe('parseClubScoreboard', () => {
  it('keeps only games involving a tracked club and tags them with our team id', () => {
    const raw = scoreboard([
      // Man Utd (360) vs a non-tracked club → kept, home tagged MUN.
      event({
        id: '1',
        date: '2026-08-15T16:30Z',
        homeId: '360',
        homeName: 'Manchester United',
        homeAbbr: 'MAN',
        awayName: 'Burnley',
        awayAbbr: 'BUR',
        state: 'pre',
      }),
      // Two non-tracked clubs → dropped.
      event({
        id: '2',
        date: '2026-08-15T14:00Z',
        homeName: 'Burnley',
        homeAbbr: 'BUR',
        awayName: 'Fulham',
        awayAbbr: 'FUL',
        state: 'pre',
      }),
    ]);
    const out = parseClubScoreboard(raw, 'epl');
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe('espn:1');
    expect(out[0]!.competitionId).toBe('epl');
    expect(out[0]!.home.teamId).toBe('MUN');
    expect(out[0]!.away.teamId).toBeUndefined();
    expect(out[0]!.status).toBe('scheduled');
    expect(out[0]!.result).toBeUndefined();
  });

  it('reads a final score off a completed game', () => {
    const raw = scoreboard([
      event({
        id: '9',
        date: '2026-08-15T16:30Z',
        homeId: '359',
        homeName: 'Arsenal',
        homeAbbr: 'ARS',
        awayId: '364',
        awayName: 'Liverpool',
        awayAbbr: 'LIV',
        state: 'post',
        completed: true,
        homeScore: '2',
        awayScore: '1',
      }),
    ]);
    const out = parseClubScoreboard(raw, 'epl');
    expect(out[0]!.status).toBe('final');
    expect(out[0]!.result).toEqual({ home: 2, away: 1 });
    // Both tracked → both tagged.
    expect(out[0]!.home.teamId).toBe('ARS');
    expect(out[0]!.away.teamId).toBe('LIV');
  });

  it('marks an in-play game live with no result yet', () => {
    const raw = scoreboard([
      event({
        id: '3',
        date: '2026-08-15T16:30Z',
        homeId: '86',
        homeName: 'Real Madrid',
        homeAbbr: 'RMA',
        awayName: 'Getafe',
        awayAbbr: 'GET',
        state: 'in',
        homeScore: '1',
        awayScore: '0',
      }),
    ]);
    const out = parseClubScoreboard(raw, 'laliga');
    expect(out[0]!.status).toBe('live');
    expect(out[0]!.result).toBeUndefined();
  });
});

describe('mergeClubFeeds', () => {
  it('de-duplicates by external id and sorts by kick-off', () => {
    const a = parseClubScoreboard(
      scoreboard([
        event({
          id: '1',
          date: '2026-08-20T18:00Z',
          homeId: '360',
          homeName: 'Man Utd',
          homeAbbr: 'MAN',
          awayName: 'X',
          awayAbbr: 'X',
          state: 'pre',
        }),
      ]),
      'ucl',
    );
    const b = parseClubScoreboard(
      scoreboard([
        event({
          id: '1',
          date: '2026-08-20T18:00Z',
          homeId: '360',
          homeName: 'Man Utd',
          homeAbbr: 'MAN',
          awayName: 'X',
          awayAbbr: 'X',
          state: 'pre',
        }),
        event({
          id: '2',
          date: '2026-08-15T12:00Z',
          homeId: '364',
          homeName: 'Liverpool',
          homeAbbr: 'LIV',
          awayName: 'Y',
          awayAbbr: 'Y',
          state: 'pre',
        }),
      ]),
      'epl',
    );
    const merged = mergeClubFeeds([a, b]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.externalId).toBe('espn:2'); // earlier kick-off first
  });
});

describe('clubFeedWindow + url', () => {
  it('builds a rolling window and a scoreboard url', () => {
    const win = clubFeedWindow(new Date('2026-08-15T12:00:00.000Z'));
    expect(win.fromYmd).toBe('20260813');
    expect(win.toYmd).toBe('20260831');
    expect(Date.parse(win.fromIso)).toBeLessThan(Date.parse(win.toIso));
    expect(clubScoreboardUrl('eng.1', win.fromYmd, win.toYmd)).toContain(
      'soccer/eng.1/scoreboard?dates=20260813-20260831',
    );
  });
});
