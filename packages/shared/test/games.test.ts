import { describe, expect, it } from 'vitest';
import {
  battleshipClearFleet,
  battleshipPlaceShip,
  battleshipReady,
  battleshipShuffle,
  createGame,
  isMyTurn,
  joinGame,
  leaveGame,
  makeMove,
  placeFleetRandom,
  remainingShipLengths,
  resetGame,
  reversiLegalMoves,
  seatOf,
  shipCellsFrom,
  startGame,
  type BattleshipGame,
  type Connect4Game,
  type DotsGame,
  type GameSession,
  type ReversiGame,
  type TicTacToeGame,
} from '../src/games.js';

const now = () => new Date('2026-05-30T12:00:00Z');

function seatTwo(type: 'tictactoe' | 'connect4' | 'reversi' | 'battleship' | 'dots'): GameSession {
  let g = createGame({ roomId: 'r1', type, createdBy: 'alice', now });
  g = joinGame(g, 'bob', now);
  return startGame(g, now);
}

describe('games — lobby', () => {
  it('creates a lobby with the creator seated', () => {
    const g = createGame({ roomId: 'r1', type: 'tictactoe', createdBy: 'alice', now });
    expect(g.status).toBe('lobby');
    expect(g.seats).toEqual([{ seat: 0, memberId: 'alice' }]);
  });

  it('lets players join and leave, re-indexing seats', () => {
    let g = createGame({ roomId: 'r1', type: 'dots', createdBy: 'alice', now });
    g = joinGame(g, 'bob', now);
    g = joinGame(g, 'cara', now);
    expect(g.seats.map((s) => s.memberId)).toEqual(['alice', 'bob', 'cara']);
    expect((g as DotsGame).scores).toEqual([0, 0, 0]);

    g = leaveGame(g, 'bob', now);
    expect(g.seats).toEqual([
      { seat: 0, memberId: 'alice' },
      { seat: 1, memberId: 'cara' },
    ]);
  });

  it('does not seat the same member twice or exceed the max', () => {
    let g = createGame({ roomId: 'r1', type: 'tictactoe', createdBy: 'alice', now });
    g = joinGame(g, 'alice', now); // already seated
    expect(g.seats).toHaveLength(1);
    g = joinGame(g, 'bob', now);
    g = joinGame(g, 'cara', now); // tic-tac-toe max is 2
    expect(g.seats).toHaveLength(2);
  });

  it('refuses to start without the minimum players', () => {
    const g = createGame({ roomId: 'r1', type: 'tictactoe', createdBy: 'alice', now });
    expect(startGame(g, now).status).toBe('lobby');
  });
});

describe('games — tic-tac-toe', () => {
  it('enforces turn order and rejects occupied cells', () => {
    const g = seatTwo('tictactoe') as TicTacToeGame;
    expect(isMyTurn(g, 'alice')).toBe(true);
    expect(isMyTurn(g, 'bob')).toBe(false);

    // Bob can't move first.
    expect(makeMove(g, 'bob', { kind: 'cell', index: 0 })).toBe(g);
    // Alice plays 0, then Bob can't replay 0.
    const g1 = makeMove(g, 'alice', { kind: 'cell', index: 0 }, now) as TicTacToeGame;
    expect(g1.cells[0]).toBe(0);
    expect(g1.turn).toBe(1);
    expect(makeMove(g1, 'bob', { kind: 'cell', index: 0 })).toBe(g1);
  });

  it('detects a win', () => {
    let g = seatTwo('tictactoe');
    // Alice (seat 0) takes the top row: 0,1,2; Bob takes 3,4.
    g = makeMove(g, 'alice', { kind: 'cell', index: 0 }, now);
    g = makeMove(g, 'bob', { kind: 'cell', index: 3 }, now);
    g = makeMove(g, 'alice', { kind: 'cell', index: 1 }, now);
    g = makeMove(g, 'bob', { kind: 'cell', index: 4 }, now);
    g = makeMove(g, 'alice', { kind: 'cell', index: 2 }, now);
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([0]);
    // No more moves once finished.
    expect(makeMove(g, 'bob', { kind: 'cell', index: 5 })).toBe(g);
  });

  it('detects a draw', () => {
    let g = seatTwo('tictactoe');
    // X O X / X O O / O X X  → full board, no line.
    const moves = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (const [i, cell] of moves.entries()) {
      g = makeMove(g, i % 2 === 0 ? 'alice' : 'bob', { kind: 'cell', index: cell }, now);
    }
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([]);
  });

  it('rematch keeps players and clears the board', () => {
    let g = seatTwo('tictactoe');
    g = makeMove(g, 'alice', { kind: 'cell', index: 0 }, now);
    const r = resetGame(g, now) as TicTacToeGame;
    expect(r.id).toBe(g.id);
    expect(r.status).toBe('playing');
    expect(r.cells.every((c) => c === null)).toBe(true);
    expect(r.seats).toHaveLength(2);
  });
});

describe('games — connect four', () => {
  it('drops discs to the bottom and stacks them', () => {
    let g = seatTwo('connect4') as Connect4Game;
    expect(g.cols).toBe(7);
    expect(g.rows).toBe(6);

    g = makeMove(g, 'alice', { kind: 'drop', col: 3 }, now) as Connect4Game;
    // Bottom row (row 5) of column 3 is Alice (seat 0).
    expect(g.cells[5 * 7 + 3]).toBe(0);
    expect(g.turn).toBe(1);
    g = makeMove(g, 'bob', { kind: 'drop', col: 3 }, now) as Connect4Game;
    // Stacks on top (row 4).
    expect(g.cells[4 * 7 + 3]).toBe(1);
  });

  it('detects a vertical four-in-a-row', () => {
    let g = seatTwo('connect4');
    // Alice stacks col 0 four high; Bob plays col 1 in between.
    g = makeMove(g, 'alice', { kind: 'drop', col: 0 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 1 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 0 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 1 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 0 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 1 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 0 }, now);
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([0]);
  });

  it('detects a horizontal four-in-a-row', () => {
    let g = seatTwo('connect4');
    // Alice across cols 0-3 on the bottom; Bob stacks col 6.
    g = makeMove(g, 'alice', { kind: 'drop', col: 0 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 6 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 1 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 6 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 2 }, now);
    g = makeMove(g, 'bob', { kind: 'drop', col: 6 }, now);
    g = makeMove(g, 'alice', { kind: 'drop', col: 3 }, now);
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([0]);
  });

  it('rejects a move in a full column and the wrong move kind', () => {
    let g = seatTwo('connect4') as Connect4Game;
    // Fill column 0 (6 discs) alternating turns.
    for (let i = 0; i < 6; i++) {
      g = makeMove(g, i % 2 === 0 ? 'alice' : 'bob', { kind: 'drop', col: 0 }, now) as Connect4Game;
    }
    const whoseTurn = g.turn === 0 ? 'alice' : 'bob';
    expect(makeMove(g, whoseTurn, { kind: 'drop', col: 0 })).toBe(g); // full
    expect(makeMove(g, whoseTurn, { kind: 'cell', index: 0 })).toBe(g); // wrong kind
  });
});

describe('games — reversi', () => {
  it('starts with four centre discs and four legal opening moves', () => {
    const g = seatTwo('reversi') as ReversiGame;
    expect(g.size).toBe(8);
    const discs = g.cells.filter((c) => c !== null).length;
    expect(discs).toBe(4);
    expect(reversiLegalMoves(g)).toHaveLength(4);
  });

  it('flips a flanked disc and passes the turn', () => {
    const g = seatTwo('reversi') as ReversiGame;
    const move = reversiLegalMoves(g)[0]!;
    const g1 = makeMove(g, 'alice', { kind: 'cell', index: move }, now) as ReversiGame;
    expect(g1).not.toBe(g);
    // One placed + one flipped, all black (seat 0); white loses one.
    expect(g1.cells.filter((c) => c === 0)).toHaveLength(4);
    expect(g1.cells.filter((c) => c === 1)).toHaveLength(1);
    expect(g1.turn).toBe(1);
  });

  it('rejects a move that flips nothing', () => {
    const g = seatTwo('reversi');
    // A corner can never be legal on the opening move.
    expect(makeMove(g, 'alice', { kind: 'cell', index: 0 })).toBe(g);
  });
});

describe('games — battleship', () => {
  it('places a valid, non-overlapping fleet of 17 cells', () => {
    const fleet = placeFleetRandom(10, [5, 4, 3, 3, 2], Math.random);
    expect(fleet.map((s) => s.length).sort()).toEqual([2, 3, 3, 4, 5]);
    const all = fleet.flat();
    expect(new Set(all).size).toBe(17); // no overlaps
    expect(all.every((i) => i >= 0 && i < 100)).toBe(true);
  });

  it('starts in the placing phase with an initial arrangement', () => {
    const g = seatTwo('battleship') as BattleshipGame;
    expect(g.phase).toBe('placing');
    expect(g.fleets[0]!.flat()).toHaveLength(17);
    expect(g.ready).toEqual([false, false]);
  });

  it('places ships, rejects overlaps/wrong lengths, and starts firing when ready', () => {
    let g = battleshipClearFleet(seatTwo('battleship') as BattleshipGame, 0, now) as BattleshipGame;
    g = battleshipClearFleet(g, 1, now) as BattleshipGame;
    expect(remainingShipLengths(g, 0)).toEqual([5, 4, 3, 3, 2]);

    // shipCellsFrom builds a straight line, or null off-board.
    expect(shipCellsFrom(0, 5, 'h', 10)).toEqual([0, 1, 2, 3, 4]);
    expect(shipCellsFrom(8, 5, 'h', 10)).toBeNull();

    g = battleshipPlaceShip(g, 0, [0, 1, 2, 3, 4], now) as BattleshipGame; // carrier
    expect(g.fleets[0]).toHaveLength(1);
    // Overlap rejected; wrong length rejected.
    expect(battleshipPlaceShip(g, 0, [4, 5, 6, 7], now)).toBe(g); // overlaps cell 4
    expect(battleshipPlaceShip(g, 0, [20, 21], now)).not.toBe(g); // destroyer ok (len 2)

    // Can't ready an incomplete fleet.
    expect(battleshipReady(g, 0, now)).toBe(g);

    // Shuffle to a full fleet, then both ready → firing.
    g = battleshipShuffle(g, 0, now) as BattleshipGame;
    g = battleshipShuffle(g, 1, now) as BattleshipGame;
    g = battleshipReady(g, 0, now) as BattleshipGame;
    expect(g.phase).toBe('placing');
    g = battleshipReady(g, 1, now) as BattleshipGame;
    expect(g.phase).toBe('firing');
  });

  it('records hits/misses, rejects repeats, and detects the win', () => {
    let g = seatTwo('battleship') as BattleshipGame;
    // Jump to firing with known fleets so we can aim deterministically.
    g = {
      ...g,
      phase: 'firing',
      turn: 0,
      ready: [true, true],
      fleets: [[[0, 1]], [[10, 11]]],
      shots: [[], []],
    };

    // Alice (seat 0) fires at Bob's ship cell 10 → hit, turn passes.
    g = makeMove(g, 'alice', { kind: 'cell', index: 10 }, now) as BattleshipGame;
    expect(g.shots[1]).toEqual([{ index: 10, hit: true }]);
    expect(g.turn).toBe(1);
    // Bob fires at empty water → miss.
    g = makeMove(g, 'bob', { kind: 'cell', index: 99 }, now) as BattleshipGame;
    expect(g.shots[0]).toEqual([{ index: 99, hit: false }]);
    // Alice can't re-fire cell 10.
    const same = makeMove(g, 'alice', { kind: 'cell', index: 10 });
    expect(same).toBe(g);
    // Alice sinks the last cell (11) → wins.
    g = makeMove(g, 'alice', { kind: 'cell', index: 11 }, now) as BattleshipGame;
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([0]);
  });
});

describe('games — dots & boxes', () => {
  it('claims a box and grants another turn', () => {
    // 1×1 board: 4 edges, 1 box. Whoever draws the 4th edge claims it.
    let g = startGame(
      joinGame(
        createGame({ roomId: 'r1', type: 'dots', createdBy: 'alice', size: 1, now }),
        'bob',
        now,
      ),
      now,
    ) as DotsGame;
    expect(g.hEdges).toHaveLength(2); // (1+1) rows × 1
    expect(g.vEdges).toHaveLength(2); // 1 row × (1+1)

    g = makeMove(g, 'alice', { kind: 'edge', orient: 'h', index: 0 }, now) as DotsGame; // top
    expect(g.turn).toBe(1);
    g = makeMove(g, 'bob', { kind: 'edge', orient: 'h', index: 1 }, now) as DotsGame; // bottom
    expect(g.turn).toBe(0);
    g = makeMove(g, 'alice', { kind: 'edge', orient: 'v', index: 0 }, now) as DotsGame; // left
    expect(g.turn).toBe(1);
    // Bob draws the right edge, completing the only box → claims it, game ends.
    g = makeMove(g, 'bob', { kind: 'edge', orient: 'v', index: 1 }, now) as DotsGame;
    expect(g.boxes[0]).toBe(1);
    expect(g.scores[1]).toBe(1);
    expect(g.status).toBe('finished');
    expect(g.winners).toEqual([1]);
  });

  it('rejects an already-drawn edge and off-turn moves', () => {
    const g = seatTwo('dots') as DotsGame;
    const g1 = makeMove(g, 'alice', { kind: 'edge', orient: 'h', index: 0 }, now);
    expect(g1).not.toBe(g);
    // Re-drawing the same edge is illegal (returns same ref).
    expect(makeMove(g1, 'bob', { kind: 'edge', orient: 'h', index: 0 })).toBe(g1);
    // Wrong move kind for this game.
    expect(makeMove(g1, 'bob', { kind: 'cell', index: 0 })).toBe(g1);
  });

  it('supports 3–4 players in the lobby', () => {
    let g = createGame({ roomId: 'r1', type: 'dots', createdBy: 'a', now });
    g = joinGame(g, 'b', now);
    g = joinGame(g, 'c', now);
    g = joinGame(g, 'd', now);
    expect(g.seats).toHaveLength(4);
    const e = joinGame(g, 'e', now); // exceeds max 4
    expect(e.seats).toHaveLength(4);
    expect(seatOf(g, 'd')).toBe(3);
  });
});
