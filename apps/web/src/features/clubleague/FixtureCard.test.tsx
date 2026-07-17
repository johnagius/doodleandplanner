import {
  orderedFixtures,
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
import { ClubTable } from './ClubTable.js';
import { FixtureCard } from './FixtureCard.js';

afterEach(() => useClubLeagueStore.setState({ meId: null, admin: false }));

const FIXED = () => new Date('2026-08-01T00:00:00.000Z');

const MUN_ARS: ClubFeedFixture = {
  externalId: 'espn:1',
  competitionId: 'epl',
  kickoff: '2026-08-15T16:30:00.000Z',
  home: { name: 'MUN', short: 'MUN', teamId: 'MUN' },
  away: { name: 'ARS', short: 'ARS', teamId: 'ARS' },
  status: 'scheduled',
};

function board(): ClubLeagueState {
  return syncClubFeed(seedClubLeague(FIXED), [MUN_ARS], { now: FIXED });
}

describe('FixtureCard', () => {
  it('shows the competition, both teams (enriched) and an Open state before kick-off', () => {
    const club = board();
    const fixture = orderedFixtures(club)[0]!;
    const { getByText } = render(<FixtureCard club={club} fixture={fixture} />);
    expect(getByText('Manchester United')).toBeTruthy();
    expect(getByText('Arsenal')).toBeTruthy();
    expect(getByText('Open')).toBeTruthy();
  });

  it('reveals a settled result with per-market points once played', () => {
    let club = board();
    const fixture = orderedFixtures(club)[0]!;
    const me = club.predictors[0]!.id;
    club = setClubPrediction(
      club,
      { fixtureId: fixture.id, predictorId: me, outcome: '1', totals: 'over', btts: 'yes' },
      { now: () => new Date('2026-08-10T00:00:00.000Z') },
    );
    club = setFixtureResult(club, fixture.id, { home: 3, away: 1 }); // 1 / over / yes → +7
    const played = orderedFixtures(club).find((f) => f.id === fixture.id)!;
    const { getByText } = render(<FixtureCard club={club} fixture={played} />);
    expect(getByText('3–1 FT')).toBeTruthy();
    expect(getByText('+7')).toBeTruthy();
  });
});

describe('ClubTable', () => {
  it('renders standings after a result and an empty state before any', () => {
    const { getByText, unmount } = render(<ClubTable club={board()} />);
    expect(getByText('No results yet')).toBeTruthy();
    unmount();

    let club = board();
    const fixture = orderedFixtures(club)[0]!;
    const me = club.predictors[0]!;
    club = setClubPrediction(
      club,
      { fixtureId: fixture.id, predictorId: me.id, outcome: '1', totals: 'over', btts: 'yes' },
      { now: () => new Date('2026-08-10T00:00:00.000Z') },
    );
    club = setFixtureResult(club, fixture.id, { home: 3, away: 1 });
    const { getAllByText } = render(<ClubTable club={club} />);
    expect(getAllByText(me.name).length).toBeGreaterThan(0);
  });
});
