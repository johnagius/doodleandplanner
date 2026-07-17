import {
  clubLeaderboard,
  findPrediction,
  orderedFixtures,
  syncClubFeed,
  type ClubFeedFixture,
  type RoomState,
} from '@dap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useClubLeagueStore } from './clubLeagueStore.js';

const FEED: ClubFeedFixture = {
  externalId: 'espn:1',
  competitionId: 'epl',
  kickoff: '2999-01-01T16:30:00.000Z', // far future so it stays open
  home: { name: 'MUN', short: 'MUN', teamId: 'MUN' },
  away: { name: 'ARS', short: 'ARS', teamId: 'ARS' },
  status: 'scheduled',
};

/** Inject a feed fixture into the loaded board (the store's own syncFixtures hits
 * the network, which is unavailable in tests). */
function injectFixture(): void {
  const s = useClubLeagueStore.getState().state!;
  const clubLeague = syncClubFeed(s.clubLeague!, [FEED]);
  useClubLeagueStore.setState({ state: { ...s, clubLeague } as RoomState });
}

describe('clubLeagueStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useClubLeagueStore.setState({
      state: null,
      meId: null,
      admin: false,
      error: null,
      offline: false,
    });
  });

  it('seeds the board on first load with the seven players and no fixtures', async () => {
    await useClubLeagueStore.getState().load();
    const club = useClubLeagueStore.getState().state?.clubLeague;
    expect(club).toBeTruthy();
    expect(club!.predictors.map((p) => p.name)).toEqual([
      'John',
      'Noel',
      'Daniel',
      'Saviour',
      'Manuel',
      'Kevin',
      'Jonathan',
    ]);
    expect(club!.fixtures).toHaveLength(0); // fixtures arrive from the feed
  });

  it('records a market pick for the selected player', async () => {
    await useClubLeagueStore.getState().load();
    injectFixture();
    const club = useClubLeagueStore.getState().state!.clubLeague!;
    const me = club.predictors[0]!.id;
    const fixture = orderedFixtures(club)[0]!;
    useClubLeagueStore.getState().selectPredictor(me);
    await useClubLeagueStore.getState().predictMarket(fixture.id, {
      outcome: '1',
      totals: 'over',
      btts: 'yes',
    });
    const saved = findPrediction(useClubLeagueStore.getState().state!.clubLeague!, fixture.id, me);
    expect(saved?.outcome).toBe('1');
    expect(saved?.totals).toBe('over');
    expect(saved?.btts).toBe('yes');
  });

  it('scores the leaderboard once the organiser enters a (manual) result', async () => {
    await useClubLeagueStore.getState().load();
    injectFixture();
    const club = useClubLeagueStore.getState().state!.clubLeague!;
    const me = club.predictors[0]!;
    const fixture = orderedFixtures(club)[0]!;
    useClubLeagueStore.getState().selectPredictor(me.id);
    await useClubLeagueStore.getState().predictMarket(fixture.id, {
      outcome: '1',
      totals: 'over',
      btts: 'yes',
    });
    await useClubLeagueStore.getState().enterResult(fixture.id, 3, 1); // 1 / over / yes → 7
    const rows = clubLeaderboard(useClubLeagueStore.getState().state!.clubLeague!);
    expect(rows.find((r) => r.predictorId === me.id)!.points).toBe(7);
    // Organiser results are flagged manual so the feed won't overwrite them.
    const played = useClubLeagueStore
      .getState()
      .state!.clubLeague!.fixtures.find((f) => f.id === fixture.id)!;
    expect(played.resultManual).toBe(true);
  });
});
