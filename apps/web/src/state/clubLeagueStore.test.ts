import { clubLeaderboard, findPrediction, orderedFixtures } from '@dap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useClubLeagueStore } from './clubLeagueStore.js';

/** Exercises the real runtime wiring: load → LocalStorage repository → predict →
 * enter result → leaderboard, the same path the page drives. */
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

  it('seeds the board on first load with the seven players', async () => {
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
    expect(club!.fixtures.length).toBeGreaterThan(0);
  });

  it('records a market pick for the selected player', async () => {
    const store = useClubLeagueStore.getState();
    await store.load();
    const club = useClubLeagueStore.getState().state!.clubLeague!;
    const me = club.predictors[0]!.id;
    const fixture = orderedFixtures(club).find((f) => new Date(f.kickoff) > new Date())!;
    store.selectPredictor(me);
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

  it('scores the leaderboard once the organiser enters a result', async () => {
    const store = useClubLeagueStore.getState();
    await store.load();
    const club = useClubLeagueStore.getState().state!.clubLeague!;
    const me = club.predictors[0]!;
    const fixture = orderedFixtures(club).find((f) => new Date(f.kickoff) > new Date())!;
    store.selectPredictor(me.id);
    await useClubLeagueStore.getState().predictMarket(fixture.id, {
      outcome: '1',
      totals: 'over',
      btts: 'yes',
    });
    // 3-1 settles 1 / over / yes → all three markets = 7 pts.
    await useClubLeagueStore.getState().enterResult(fixture.id, 3, 1);
    const rows = clubLeaderboard(useClubLeagueStore.getState().state!.clubLeague!);
    expect(rows.find((r) => r.predictorId === me.id)!.points).toBe(7);
  });
});
