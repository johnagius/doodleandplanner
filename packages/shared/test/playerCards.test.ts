import { describe, expect, it } from 'vitest';
import {
  allCardAwards,
  cardBadgeFor,
  cardDraw,
  cardLeaderboard,
  cardsWonBy,
  playerCard,
} from '../src/playerCards.js';
import { WC_SQUADS } from '../src/squads.js';
import {
  seedWorldCup,
  setCardBadge,
  setPrediction,
  setResult,
  type WorldCupState,
} from '../src/worldcup.js';

const NOW = () => new Date('2026-06-01T00:00:00Z');
type P = WorldCupState['predictors'][number];

describe('squads', () => {
  it('is the full WC player pool across all 48 nations', () => {
    expect(WC_SQUADS.length).toBeGreaterThan(1000);
    expect(new Set(WC_SQUADS.map((p) => p.nat)).size).toBe(48);
    expect(WC_SQUADS.every((p) => !!p.name && ['GK', 'DEF', 'MID', 'FWD'].includes(p.pos))).toBe(
      true,
    );
  });
});

describe('playerCard', () => {
  it('is deterministic with sane ranges and the right tier', () => {
    const p = WC_SQUADS[0]!;
    const c = playerCard(p);
    expect(playerCard(p)).toEqual(c); // stable
    expect(c.overall).toBeGreaterThanOrEqual(62);
    expect(c.overall).toBeLessThanOrEqual(91);
    for (const v of Object.values(c.stats)) {
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(99);
    }
    expect(c.tier).toBe(c.overall >= 84 ? 'gold' : c.overall >= 75 ? 'silver' : 'bronze');
  });
});

describe('cardDraw', () => {
  it('draws deterministically from the pool', () => {
    const a = cardDraw('g-A-1', 'p1');
    expect(cardDraw('g-A-1', 'p1')).toEqual(a);
    expect(WC_SQUADS).toContainEqual(a);
  });
});

describe('cardsWonBy + cardLeaderboard', () => {
  it('awards a card to a match top scorer, none to a misser', () => {
    let s = seedWorldCup(NOW);
    const [john, daniel] = s.predictors as [P, P];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 0, away: 5, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });

    const won = cardsWonBy(s, john.id);
    expect(won).toHaveLength(1);
    expect(won[0]!.matchId).toBe('g-A-1');
    expect(cardsWonBy(s, daniel.id)).toHaveLength(0);
    expect(cardLeaderboard(s)[0]).toMatchObject({ predictorId: john.id, cards: 1 });
  });

  it('gives every joint top scorer a card on a tie', () => {
    let s = seedWorldCup(NOW);
    const [a, b] = s.predictors as [P, P];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 1, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 1, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });
    expect(cardsWonBy(s, a.id)).toHaveLength(1);
    expect(cardsWonBy(s, b.id)).toHaveLength(1);
  });

  it('never pulls the same player twice in a collection', () => {
    let s = seedWorldCup(NOW);
    const john = s.predictors[0]!;
    // John tops the first 40 group matches (predicts 2-0, result 2-0).
    for (const m of s.matches.filter((x) => x.stage === 'group').slice(0, 40)) {
      s = setPrediction(s, { matchId: m.id, predictorId: john.id, home: 2, away: 0, now: NOW });
      s = setResult(s, { matchId: m.id, home: 2, away: 0 });
    }
    const cards = cardsWonBy(s, john.id);
    expect(cards).toHaveLength(40);
    expect(new Set(cards.map((c) => c.player.id)).size).toBe(40); // all distinct
  });

  it('gives a globally-unique card to every joint winner of one match', () => {
    let s = seedWorldCup(NOW);
    // All four default predictors nail the same scoreline → four joint top scorers.
    for (const p of s.predictors) {
      s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 1, away: 0, now: NOW });
    }
    s = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });

    const awards = allCardAwards(s).filter((a) => a.matchId === 'g-A-1');
    expect(awards).toHaveLength(s.predictors.length); // a card each, not just one
    expect(new Set(awards.map((a) => a.player.id)).size).toBe(s.predictors.length); // all distinct
  });

  it('badges the chosen owned card, and ignores an unset or unowned pick', () => {
    let s = seedWorldCup(NOW);
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    const playerId = cardsWonBy(s, john.id)[0]!.player.id;

    expect(cardBadgeFor(s, john.id)).toBeNull(); // none set yet
    s = setCardBadge(s, john.id, playerId);
    expect(cardBadgeFor(s, john.id)?.player.id).toBe(playerId);
    // A player they don't hold (e.g. a stale badge) must not render.
    s = setCardBadge(s, john.id, -1);
    expect(cardBadgeFor(s, john.id)).toBeNull();
  });

  it('never repeats a player across the whole game, even with everyone tying every match', () => {
    let s = seedWorldCup(NOW);
    // Worst case for uniqueness: everyone predicts 2-0, every group game ends 2-0,
    // so all four predictors jointly top all 72 group matches (288 cards in play).
    for (const m of s.matches.filter((x) => x.stage === 'group')) {
      for (const p of s.predictors) {
        s = setPrediction(s, { matchId: m.id, predictorId: p.id, home: 2, away: 0, now: NOW });
      }
      s = setResult(s, { matchId: m.id, home: 2, away: 0 });
    }
    const awards = allCardAwards(s);
    expect(awards).toHaveLength(72 * s.predictors.length); // 288 awards
    // Every single one a distinct player — the 1,249 pool covers it with room to spare.
    expect(new Set(awards.map((a) => a.player.id)).size).toBe(awards.length);
  });
});
