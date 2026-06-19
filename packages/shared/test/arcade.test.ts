import { describe, expect, it } from 'vitest';
import {
  WC_ARCADE_GAMES,
  arcadeBest,
  arcadeLeaderboard,
  isArcadeGame,
  recordArcadeScore,
} from '../src/arcade.js';
import { seedWorldCup } from '../src/worldcup.js';

const NOW = () => new Date('2026-06-01T00:00:00Z');

describe('arcade high scores', () => {
  it('knows its three games', () => {
    expect(WC_ARCADE_GAMES.map((g) => g.key)).toEqual(['basketball', 'freekick', 'penalty']);
    expect(isArcadeGame('basketball')).toBe(true);
    expect(isArcadeGame('darts')).toBe(false);
  });

  it('records a best only when it beats the previous, ignoring junk', () => {
    let s = seedWorldCup(NOW);
    const me = s.predictors[0]!.id;

    s = recordArcadeScore(s, 'basketball', me, 5);
    expect(arcadeBest(s, 'basketball', me)).toBe(5);

    s = recordArcadeScore(s, 'basketball', me, 3); // worse → ignored
    expect(arcadeBest(s, 'basketball', me)).toBe(5);

    s = recordArcadeScore(s, 'basketball', me, 8); // better → kept (floored)
    expect(arcadeBest(s, 'basketball', me)).toBe(8);

    const before = s;
    expect(recordArcadeScore(s, 'basketball', me, 0)).toBe(before); // no-op, same ref
    expect(recordArcadeScore(s, 'basketball', me, NaN)).toBe(before);

    // Games are independent; an unset game/player reads 0.
    expect(arcadeBest(s, 'freekick', me)).toBe(0);
    expect(arcadeBest(s, 'basketball', null)).toBe(0);
  });

  it('builds a best-first leaderboard of only those who have scored', () => {
    let s = seedWorldCup(NOW);
    const [a, b, c] = s.predictors as [{ id: string }, { id: string }, { id: string }];
    s = recordArcadeScore(s, 'penalty', a.id, 4);
    s = recordArcadeScore(s, 'penalty', b.id, 9);
    // c never plays → absent from the table.
    const lb = arcadeLeaderboard(s, 'penalty');
    expect(lb.map((r) => r.predictorId)).toEqual([b.id, a.id]);
    expect(lb.map((r) => r.best)).toEqual([9, 4]);
    expect(lb.some((r) => r.predictorId === c.id)).toBe(false);
  });
});
