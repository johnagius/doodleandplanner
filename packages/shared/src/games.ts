/**
 * Multiplayer party games, modelled as pure serialisable state that rides along
 * in {@link RoomState} and therefore syncs in real time through the same
 * Repository as everything else. All functions are pure and immutable: they
 * validate a move and return a NEW game (or the same reference when the move is
 * illegal), never mutating in place.
 *
 * Supported games:
 *  - tictactoe — 2 players, classic 3×3.
 *  - connect4  — 2 players, 7×6 four-in-a-row.
 *  - reversi   — 2 players, 8×8 Othello (flank & flip).
 *  - dots      — Dots & Boxes, 2–4 players on an n×n grid of boxes.
 */
import { generateId } from './ids.js';
import type { ISODateTime } from './types.js';

export type GameType = 'tictactoe' | 'connect4' | 'reversi' | 'battleship' | 'dots';
export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface GameSeat {
  /** Turn-order seat index (0-based). */
  seat: number;
  memberId: string;
}

interface GameBase {
  id: string;
  roomId: string;
  type: GameType;
  /** Seated players in turn order. */
  seats: GameSeat[];
  status: GameStatus;
  /** Seat index whose turn it is (while playing). */
  turn: number;
  /** Winning seat indices once finished. Empty ⇒ draw. */
  winners: number[];
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TicTacToeGame extends GameBase {
  type: 'tictactoe';
  /** 9 cells, row-major; each holds the owning seat index or null. */
  cells: (number | null)[];
}

export interface Connect4Game extends GameBase {
  type: 'connect4';
  cols: number;
  rows: number;
  /** cols×rows cells, row-major from the TOP; seat index or null. */
  cells: (number | null)[];
}

export interface ReversiGame extends GameBase {
  type: 'reversi';
  size: number; // 8
  /** size×size cells, row-major; seat index (0/1) or null. */
  cells: (number | null)[];
}

/** A shot fired at a board cell, with whether it struck a ship. */
export interface Shot {
  index: number;
  hit: boolean;
}

export interface BattleshipGame extends GameBase {
  type: 'battleship';
  size: number; // 10
  /** Per-seat fleet: a list of ships, each the cell indices it occupies. */
  fleets: number[][][];
  /** Per-seat shots received at that seat's board (the enemy UI reads only this). */
  shots: Shot[][];
}

export interface DotsGame extends GameBase {
  type: 'dots';
  /** Number of boxes per side (n × n boxes, (n+1) × (n+1) dots). */
  size: number;
  /** Horizontal edges: (size+1) rows × size cols, row-major. */
  hEdges: boolean[];
  /** Vertical edges: size rows × (size+1) cols, row-major. */
  vEdges: boolean[];
  /** Owner seat index per box (size × size), or null if unclaimed. */
  boxes: (number | null)[];
  /** Claimed-box count per seat. */
  scores: number[];
}

export type GameSession = TicTacToeGame | Connect4Game | ReversiGame | BattleshipGame | DotsGame;

export type GameMove =
  | { kind: 'cell'; index: number }
  | { kind: 'drop'; col: number }
  | { kind: 'edge'; orient: 'h' | 'v'; index: number };

export interface GameMeta {
  type: GameType;
  name: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  blurb: string;
}

export const GAME_CATALOG: GameMeta[] = [
  {
    type: 'tictactoe',
    name: 'Tic-Tac-Toe',
    icon: '⭕',
    minPlayers: 2,
    maxPlayers: 2,
    blurb: 'Three in a row on a 3×3 grid.',
  },
  {
    type: 'connect4',
    name: 'Connect Four',
    icon: '🔴',
    minPlayers: 2,
    maxPlayers: 2,
    blurb: 'Drop discs to get four in a row — any direction.',
  },
  {
    type: 'reversi',
    name: 'Reversi',
    icon: '⚫',
    minPlayers: 2,
    maxPlayers: 2,
    blurb: 'Flank and flip your opponent’s discs. Most discs wins.',
  },
  {
    type: 'battleship',
    name: 'Battleship',
    icon: '🚢',
    minPlayers: 2,
    maxPlayers: 2,
    blurb: 'Fire on hidden fleets — sink all your rival’s ships to win.',
  },
  {
    type: 'dots',
    name: 'Dots & Boxes',
    icon: '🔲',
    minPlayers: 2,
    maxPlayers: 4,
    blurb: 'Draw lines, close boxes, take another turn. Most boxes wins.',
  },
];

export function gameMeta(type: GameType): GameMeta {
  const meta = GAME_CATALOG.find((g) => g.type === type);
  if (!meta) throw new Error(`Unknown game type: ${type}`);
  return meta;
}

const DEFAULT_DOTS_SIZE = 3;
const C4_COLS = 7;
const C4_ROWS = 6;
const REVERSI_SIZE = 8;
const BATTLESHIP_SIZE = 10;
/** Classic fleet: carrier, battleship, cruiser, submarine, destroyer. */
const BATTLESHIP_FLEET = [5, 4, 3, 3, 2];

/** Randomly place the fleet on a size×size board; ships never overlap. */
export function placeFleetRandom(
  size = BATTLESHIP_SIZE,
  lengths: number[] = BATTLESHIP_FLEET,
  rand: () => number = Math.random,
): number[][] {
  const occupied = new Set<number>();
  const fleet: number[][] = [];
  for (const len of lengths) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const horizontal = rand() < 0.5;
      const row = Math.floor(rand() * (horizontal ? size : size - len + 1));
      const col = Math.floor(rand() * (horizontal ? size - len + 1 : size));
      const cells: number[] = [];
      let ok = true;
      for (let k = 0; k < len; k++) {
        const idx = (horizontal ? row : row + k) * size + (horizontal ? col + k : col);
        if (occupied.has(idx)) {
          ok = false;
          break;
        }
        cells.push(idx);
      }
      if (ok) {
        cells.forEach((i) => occupied.add(i));
        fleet.push(cells);
        break;
      }
    }
  }
  return fleet;
}

const emptyShots = (): Shot[][] => [[], []];

/** Create a brand-new game in the lobby with its creator seated first. */
export function createGame(input: {
  roomId: string;
  type: GameType;
  createdBy: string;
  size?: number;
  now?: () => Date;
}): GameSession {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const base: GameBase = {
    id: generateId('game'),
    roomId: input.roomId,
    type: input.type,
    seats: [{ seat: 0, memberId: input.createdBy }],
    status: 'lobby',
    turn: 0,
    winners: [],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (input.type === 'tictactoe') {
    return { ...base, type: 'tictactoe', cells: Array(9).fill(null) };
  }
  if (input.type === 'connect4') {
    return {
      ...base,
      type: 'connect4',
      cols: C4_COLS,
      rows: C4_ROWS,
      cells: Array(C4_COLS * C4_ROWS).fill(null),
    };
  }
  if (input.type === 'reversi') {
    const cells: (number | null)[] = Array(REVERSI_SIZE * REVERSI_SIZE).fill(null);
    const c = REVERSI_SIZE / 2;
    const at = (r: number, col: number) => r * REVERSI_SIZE + col;
    cells[at(c - 1, c - 1)] = 1;
    cells[at(c - 1, c)] = 0;
    cells[at(c, c - 1)] = 0;
    cells[at(c, c)] = 1;
    return { ...base, type: 'reversi', size: REVERSI_SIZE, cells };
  }
  if (input.type === 'battleship') {
    // Fleets are placed when the game starts (see startGame).
    return {
      ...base,
      type: 'battleship',
      size: BATTLESHIP_SIZE,
      fleets: [[], []],
      shots: emptyShots(),
    };
  }
  const size = input.size ?? DEFAULT_DOTS_SIZE;
  return {
    ...base,
    type: 'dots',
    size,
    hEdges: Array((size + 1) * size).fill(false),
    vEdges: Array(size * (size + 1)).fill(false),
    boxes: Array(size * size).fill(null),
    scores: [0],
  };
}

function touch(game: GameSession, now?: () => Date): GameSession {
  return { ...game, updatedAt: (now ?? (() => new Date()))().toISOString() };
}

/** Take an open seat in a lobby. No-op if already seated, full, or started. */
export function joinGame(game: GameSession, memberId: string, now?: () => Date): GameSession {
  if (game.status !== 'lobby') return game;
  if (game.seats.some((s) => s.memberId === memberId)) return game;
  if (game.seats.length >= gameMeta(game.type).maxPlayers) return game;
  const seats = [...game.seats, { seat: game.seats.length, memberId }];
  const next = { ...game, seats } as GameSession;
  if (next.type === 'dots') next.scores = Array(seats.length).fill(0);
  return touch(next, now);
}

/** Leave a lobby seat, re-indexing the remaining seats. No-op once started. */
export function leaveGame(game: GameSession, memberId: string, now?: () => Date): GameSession {
  if (game.status !== 'lobby') return game;
  if (!game.seats.some((s) => s.memberId === memberId)) return game;
  const seats = game.seats
    .filter((s) => s.memberId !== memberId)
    .map((s, i) => ({ seat: i, memberId: s.memberId }));
  const next = { ...game, seats } as GameSession;
  if (next.type === 'dots') next.scores = Array(seats.length).fill(0);
  return touch(next, now);
}

/** Begin play. Requires at least the game's minimum number of players. */
export function startGame(game: GameSession, now?: () => Date): GameSession {
  if (game.status !== 'lobby') return game;
  if (game.seats.length < gameMeta(game.type).minPlayers) return game;
  const started = { ...game, status: 'playing' as const, turn: 0, winners: [] } as GameSession;
  // Battleship places both hidden fleets at kick-off.
  if (started.type === 'battleship') {
    started.fleets = [placeFleetRandom(started.size), placeFleetRandom(started.size)];
    started.shots = emptyShots();
  }
  return touch(started, now);
}

/** Seat index for a member, or -1 if not seated. */
export function seatOf(game: GameSession, memberId: string): number {
  return game.seats.find((s) => s.memberId === memberId)?.seat ?? -1;
}

/** Whether it's this member's turn to move right now. */
export function isMyTurn(game: GameSession, memberId: string): boolean {
  return game.status === 'playing' && seatOf(game, memberId) === game.turn;
}

const TTT_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function ticTacToeWinner(cells: (number | null)[]): number | null {
  for (const [a, b, c] of TTT_LINES) {
    const v = cells[a];
    if (v != null && v === cells[b] && v === cells[c]) return v;
  }
  return null;
}

/**
 * Apply a move on behalf of `memberId`. Returns the same game reference when the
 * move is illegal (not your turn, occupied, wrong move kind, finished), so the
 * caller can detect rejection by identity.
 */
export function makeMove(
  game: GameSession,
  memberId: string,
  move: GameMove,
  now?: () => Date,
): GameSession {
  if (!isMyTurn(game, memberId)) return game;
  switch (game.type) {
    case 'tictactoe':
      return ticTacToeMove(game, move, now);
    case 'connect4':
      return connect4Move(game, move, now);
    case 'reversi':
      return reversiMove(game, move, now);
    case 'battleship':
      return battleshipMove(game, move, now);
    default:
      return dotsMove(game, move, now);
  }
}

/** Total ship cells in a fleet. */
function fleetCellCount(fleet: number[][]): number {
  return fleet.reduce((n, ship) => n + ship.length, 0);
}

function battleshipMove(game: BattleshipGame, move: GameMove, now?: () => Date): GameSession {
  if (move.kind !== 'cell') return game;
  if (move.index < 0 || move.index >= game.size * game.size) return game;
  const opp = game.turn === 0 ? 1 : 0;
  const targetShots = game.shots[opp] ?? [];
  if (targetShots.some((s) => s.index === move.index)) return game; // already fired here

  const hit = (game.fleets[opp] ?? []).some((ship) => ship.includes(move.index));
  const shots = game.shots.map((arr, i) =>
    i === opp ? [...arr, { index: move.index, hit }] : arr,
  );

  // Win when every opponent ship cell has been hit.
  const hitsOnOpp = shots[opp]!.filter((s) => s.hit).length;
  if (hitsOnOpp >= fleetCellCount(game.fleets[opp] ?? [])) {
    return touch({ ...game, shots, status: 'finished', winners: [game.turn] }, now);
  }
  return touch({ ...game, shots, turn: opp }, now);
}

const REVERSI_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** Indices that placing `seat` at `idx` would flip (empty ⇒ illegal move). */
function reversiFlips(cells: (number | null)[], size: number, idx: number, seat: number): number[] {
  if (cells[idx] !== null) return [];
  const opp = seat === 0 ? 1 : 0;
  const r0 = Math.floor(idx / size);
  const c0 = idx % size;
  const flips: number[] = [];
  for (const [dr, dc] of REVERSI_DIRS) {
    const line: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === opp) {
      line.push(r * size + c);
      r += dr;
      c += dc;
    }
    if (
      line.length > 0 &&
      r >= 0 &&
      r < size &&
      c >= 0 &&
      c < size &&
      cells[r * size + c] === seat
    ) {
      flips.push(...line);
    }
  }
  return flips;
}

/** Legal cell indices for the player to move in a Reversi game. */
export function reversiLegalMoves(game: ReversiGame): number[] {
  const moves: number[] = [];
  for (let i = 0; i < game.cells.length; i++) {
    if (reversiFlips(game.cells, game.size, i, game.turn).length > 0) moves.push(i);
  }
  return moves;
}

function reversiHasMove(cells: (number | null)[], size: number, seat: number): boolean {
  for (let i = 0; i < cells.length; i++) {
    if (reversiFlips(cells, size, i, seat).length > 0) return true;
  }
  return false;
}

function reversiMove(game: ReversiGame, move: GameMove, now?: () => Date): GameSession {
  if (move.kind !== 'cell') return game;
  if (move.index < 0 || move.index >= game.cells.length) return game;
  const flips = reversiFlips(game.cells, game.size, move.index, game.turn);
  if (flips.length === 0) return game; // illegal: must flip something

  const cells = game.cells.slice();
  cells[move.index] = game.turn;
  for (const i of flips) cells[i] = game.turn;

  const opp = game.turn === 0 ? 1 : 0;
  if (reversiHasMove(cells, game.size, opp)) {
    return touch({ ...game, cells, turn: opp }, now);
  }
  if (reversiHasMove(cells, game.size, game.turn)) {
    // Opponent must pass; same player moves again.
    return touch({ ...game, cells, turn: game.turn }, now);
  }
  // Neither can move — game over; winner has the most discs.
  const counts = [0, 0];
  for (const c of cells) if (c !== null) counts[c] = (counts[c] ?? 0) + 1;
  const max = Math.max(counts[0]!, counts[1]!);
  const winners = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  return touch({ ...game, cells, status: 'finished', winners }, now);
}

const C4_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Count same-seat cells stepping (dr,dc) from (row,col), exclusive of start. */
function countDir(
  game: Connect4Game,
  cells: (number | null)[],
  row: number,
  col: number,
  dr: number,
  dc: number,
  seat: number,
): number {
  let n = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < game.rows && c >= 0 && c < game.cols && cells[r * game.cols + c] === seat) {
    n++;
    r += dr;
    c += dc;
  }
  return n;
}

function connect4HasWin(
  game: Connect4Game,
  cells: (number | null)[],
  row: number,
  col: number,
  seat: number,
): boolean {
  for (const [dr, dc] of C4_DIRS) {
    const line =
      1 +
      countDir(game, cells, row, col, dr, dc, seat) +
      countDir(game, cells, row, col, -dr, -dc, seat);
    if (line >= 4) return true;
  }
  return false;
}

function connect4Move(game: Connect4Game, move: GameMove, now?: () => Date): GameSession {
  if (move.kind !== 'drop') return game;
  if (move.col < 0 || move.col >= game.cols) return game;
  // Find the lowest empty row in the chosen column.
  let row = -1;
  for (let r = game.rows - 1; r >= 0; r--) {
    if (game.cells[r * game.cols + move.col] === null) {
      row = r;
      break;
    }
  }
  if (row < 0) return game; // column full

  const cells = game.cells.slice();
  cells[row * game.cols + move.col] = game.turn;

  if (connect4HasWin(game, cells, row, move.col, game.turn)) {
    return touch({ ...game, cells, status: 'finished', winners: [game.turn] }, now);
  }
  if (cells.every((c) => c !== null)) {
    return touch({ ...game, cells, status: 'finished', winners: [] }, now);
  }
  const turn = (game.turn + 1) % game.seats.length;
  return touch({ ...game, cells, turn }, now);
}

function ticTacToeMove(game: TicTacToeGame, move: GameMove, now?: () => Date): GameSession {
  if (move.kind !== 'cell') return game;
  if (move.index < 0 || move.index >= 9) return game;
  if (game.cells[move.index] !== null) return game;

  const cells = game.cells.slice();
  cells[move.index] = game.turn;

  const winnerSeat = ticTacToeWinner(cells);
  if (winnerSeat !== null) {
    return touch({ ...game, cells, status: 'finished', winners: [winnerSeat] }, now);
  }
  if (cells.every((c) => c !== null)) {
    return touch({ ...game, cells, status: 'finished', winners: [] }, now);
  }
  const turn = (game.turn + 1) % game.seats.length;
  return touch({ ...game, cells, turn }, now);
}

/** Boxes (as [top,bottom,left,right] edge indices) adjacent to a given edge. */
function boxesTouchingEdge(size: number, orient: 'h' | 'v', index: number): number[] {
  const boxes: number[] = [];
  if (orient === 'h') {
    const row = Math.floor(index / size);
    const col = index % size;
    if (row > 0) boxes.push((row - 1) * size + col); // box above
    if (row < size) boxes.push(row * size + col); // box below
  } else {
    const cols = size + 1;
    const row = Math.floor(index / cols);
    const col = index % cols;
    if (col > 0) boxes.push(row * size + (col - 1)); // box left
    if (col < size) boxes.push(row * size + col); // box right
  }
  return boxes;
}

function boxComplete(size: number, hEdges: boolean[], vEdges: boolean[], box: number): boolean {
  const r = Math.floor(box / size);
  const c = box % size;
  const top = hEdges[r * size + c];
  const bottom = hEdges[(r + 1) * size + c];
  const left = vEdges[r * (size + 1) + c];
  const right = vEdges[r * (size + 1) + (c + 1)];
  return Boolean(top && bottom && left && right);
}

function dotsMove(game: DotsGame, move: GameMove, now?: () => Date): GameSession {
  if (move.kind !== 'edge') return game;
  const edges = move.orient === 'h' ? game.hEdges : game.vEdges;
  if (move.index < 0 || move.index >= edges.length) return game;
  if (edges[move.index]) return game; // already drawn

  const hEdges = move.orient === 'h' ? game.hEdges.slice() : game.hEdges;
  const vEdges = move.orient === 'v' ? game.vEdges.slice() : game.vEdges;
  if (move.orient === 'h') hEdges[move.index] = true;
  else vEdges[move.index] = true;

  const boxes = game.boxes.slice();
  const scores = game.scores.slice();
  let claimed = 0;
  for (const box of boxesTouchingEdge(game.size, move.orient, move.index)) {
    if (boxes[box] === null && boxComplete(game.size, hEdges, vEdges, box)) {
      boxes[box] = game.turn;
      scores[game.turn] = (scores[game.turn] ?? 0) + 1;
      claimed++;
    }
  }

  const filled = hEdges.every(Boolean) && vEdges.every(Boolean);
  if (filled) {
    const max = Math.max(...scores);
    const winners = scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
    return touch({ ...game, hEdges, vEdges, boxes, scores, status: 'finished', winners }, now);
  }
  // Completing at least one box earns another turn.
  const turn = claimed > 0 ? game.turn : (game.turn + 1) % game.seats.length;
  return touch({ ...game, hEdges, vEdges, boxes, scores, turn }, now);
}

/** Start a fresh round with the same players (rematch). */
export function resetGame(game: GameSession, now?: () => Date): GameSession {
  const cleared = createGame({
    roomId: game.roomId,
    type: game.type,
    createdBy: game.createdBy,
    size: game.type === 'dots' ? game.size : undefined,
    now,
  });
  const next = {
    ...cleared,
    id: game.id,
    seats: game.seats,
    status: 'playing' as const,
    turn: 0,
    winners: [],
  } as GameSession;
  // Resize per-seat scores to match the carried-over players.
  if (next.type === 'dots') next.scores = Array(game.seats.length).fill(0);
  // Re-place hidden fleets for a battleship rematch.
  if (next.type === 'battleship') {
    next.fleets = [placeFleetRandom(next.size), placeFleetRandom(next.size)];
    next.shots = emptyShots();
  }
  return touch(next, now);
}

/** Human-readable status line for a game. */
export function gameStatusText(game: GameSession, nameOf: (memberId: string) => string): string {
  if (game.status === 'lobby') {
    const meta = gameMeta(game.type);
    return `Waiting for players (${game.seats.length}/${meta.maxPlayers})`;
  }
  if (game.status === 'finished') {
    if (game.winners.length === 0) return "It's a draw!";
    if (game.winners.length === 1) {
      const seat = game.seats.find((s) => s.seat === game.winners[0]);
      return `${seat ? nameOf(seat.memberId) : 'Someone'} wins! 🎉`;
    }
    return "It's a tie!";
  }
  const seat = game.seats.find((s) => s.seat === game.turn);
  return `${seat ? nameOf(seat.memberId) : 'Someone'}'s turn`;
}
