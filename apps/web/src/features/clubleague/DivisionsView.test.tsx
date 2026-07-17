// @vitest-environment jsdom
import {
  clFinalFixture,
  seedClubLeague,
  setClubPrediction,
  setFixtureResult,
  syncClubFeed,
  type ClubFeedFixture,
  type ClubLeagueState,
} from '@dap/shared';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { DivisionsView } from './DivisionsView.js';

afterEach(() => useClubLeagueStore.setState({ meId: null, admin: false, live: {}, liveNotes: {} }));

const now = () => new Date('2026-08-10T00:00:00.000Z');
let seq = 0;

function score(
  s: ClubLeagueState,
  predictorId: string,
  kickoff: string,
  points: number,
  competitionId = 'epl',
): ClubLeagueState {
  const ext: ClubFeedFixture = {
    externalId: `dv:${(seq++).toString()}`,
    competitionId,
    kickoff,
    home: { name: 'Home', short: 'HOM' },
    away: { name: 'Away', short: 'AWY' },
    status: 'scheduled',
  };
  s = syncClubFeed(s, [ext], { now });
  const f = s.fixtures.find((x) => x.externalId === ext.externalId)!;
  if (points > 0) {
    s = setClubPrediction(
      s,
      {
        fixtureId: f.id,
        predictorId,
        outcome: '1',
        totals: points >= 5 ? 'over' : 'under',
        btts: points >= 7 ? 'yes' : 'no',
      },
      { now, force: true },
    );
  }
  return setFixtureResult(s, f.id, { home: 3, away: 1 });
}

/** A finished season: ids[0] wins the Master League run-in, ids[4] the First
 * Division run-in, and the Champions League final is played and decided. */
function decidedSeason(): { club: ClubLeagueState; ids: string[] } {
  let s = seedClubLeague(now);
  const ids = s.predictors.map((p) => p.id);
  ids.forEach((id, i) => {
    s = score(s, id, `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`, 7 - i);
  });
  s = score(s, ids[0]!, '2027-05-10T12:00:00.000Z', 7);
  s = score(s, ids[4]!, '2027-05-11T12:00:00.000Z', 7);
  // The Champions League final — the Meister decider.
  const ext: ClubFeedFixture = {
    externalId: 'dv:ucl-final',
    competitionId: 'ucl',
    kickoff: '2027-05-29T19:00:00.000Z',
    home: { name: 'Man Utd', short: 'MUN', teamId: 'MUN' },
    away: { name: 'FC Barcelona', short: 'BAR', teamId: 'BAR' },
    status: 'scheduled',
  };
  s = syncClubFeed(s, [ext], { now });
  const finalId = clFinalFixture(s)!.id;
  s = setClubPrediction(s, { fixtureId: finalId, predictorId: ids[0]!, outcome: '1' }, { now });
  s = setClubPrediction(s, { fixtureId: finalId, predictorId: ids[4]!, outcome: '2' }, { now });
  s = setFixtureResult(s, finalId, { home: 2, away: 1 }); // ids[0] right, ids[4] wrong
  return { club: s, ids };
}

describe('DivisionsView — Meister Cup', () => {
  it('shows the Meister Cup panel and the winner in the run-in period', () => {
    const { club, ids } = decidedSeason();
    const winnerName = club.predictors.find((p) => p.id === ids[0])!.name;
    const { getByText, container } = render(<DivisionsView club={club} />);
    // The panel names the trophy and the two finalists' seats.
    expect(getByText('Meister Cup')).toBeTruthy();
    expect(getByText('Master League')).toBeTruthy();
    expect(getByText('First Division')).toBeTruthy();
    // …and crowns the Master League finalist, who called the final right.
    const banner = container.querySelector('.club-meister-winner');
    expect(banner?.textContent).toContain('lifts the Meister Cup');
    expect(banner?.textContent).toContain(winnerName);
  });
});
