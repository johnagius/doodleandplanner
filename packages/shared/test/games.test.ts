import { describe, expect, it } from 'vitest';
import {
  createGame,
  isMyTurn,
  joinGame,
  leaveGame,
  makeMove,
  resetGame,
  seatOf,
  startGame,
  type DotsGame,
  type GameSession,
  type TicTacToeGame,
} from '../src/games.js';

const now = () => new Date('2026-05-30T12:00:00Z');

function seatTwo(type: 'tictactoe' | 'dots'): GameSession {
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
