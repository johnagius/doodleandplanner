/**
 * Starting-XI lineup model: classify each player's role, lay them out on a
 * half-pitch, and attach our own ability rating + an *estimated* market value
 * (no free feed carries real values). The lineup, positions and formation are
 * real (from ESPN); ratings/values are deterministic house numbers, like the
 * collectible cards. Pure + serialisable so it unit-tests and runs anywhere.
 */

export interface WcLineupPlayer {
  name: string;
  jersey: number | null;
  /** ESPN position abbreviation, e.g. "G", "CD-L", "DM", "ST". */
  pos: string;
  starter: boolean;
  /** ESPN's slot index within the formation (1..11), if given. */
  formationPlace: number | null;
}

export interface WcLineup {
  /** Canonical team code. */
  teamTla: string;
  /** Starting XI (and only the XI). */
  players: WcLineupPlayer[];
}

export interface WcLineups {
  home: WcLineup | null;
  away: WcLineup | null;
}

export type WcPitchRow = 'GK' | 'DEF' | 'DM' | 'MID' | 'AM' | 'FWD';

/** Which band of the pitch a position abbreviation belongs to. */
export function pitchRow(pos: string): WcPitchRow {
  const p = pos.toUpperCase();
  if (p === 'G' || p.startsWith('GK')) return 'GK';
  if (['ST', 'CF', 'LW', 'RW', 'SS', 'F', 'W'].includes(p) || p.startsWith('F')) return 'FWD';
  if (p.includes('AM') || p.includes('CAM')) return 'AM';
  if (p.includes('DM') || p.includes('CDM')) return 'DM';
  if (p.includes('M')) return 'MID';
  if (p.includes('B') || p.includes('D')) return 'DEF';
  return 'MID';
}

/** Left (−1) / centre (0) / right (+1) lean from the position code. */
function sideOf(pos: string): number {
  const p = pos.toUpperCase();
  if (p.endsWith('-L') || (p.startsWith('L') && p !== 'L')) return -1;
  if (p.endsWith('-R') || (p.startsWith('R') && p !== 'R')) return 1;
  return 0;
}

// Far (attacking) at the top, own keeper near the bottom — a behind-the-goal view.
const ROW_Y: Record<WcPitchRow, number> = {
  FWD: 0.16,
  AM: 0.3,
  MID: 0.44,
  DM: 0.58,
  DEF: 0.72,
  GK: 0.9,
};
const ROW_ORDER: WcPitchRow[] = ['FWD', 'AM', 'MID', 'DM', 'DEF', 'GK'];

export interface WcPlacedPlayer {
  player: WcLineupPlayer;
  row: WcPitchRow;
  /** Normalised pitch coordinates in 0..1 (x: left→right, y: far→near). */
  x: number;
  y: number;
  rating: number;
  /** Estimated market value, in millions of euros. */
  valueM: number;
}

/** 32-bit FNV-1a hash → same input, same number, everywhere. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Our deterministic "house" ability rating for a player, 62–91. */
export function lineupRating(name: string): number {
  return 62 + (hash('rate:' + name) % 30);
}

/**
 * A plausible, deterministic *estimated* market value (€M) from the rating, on a
 * steep curve (stars worth a lot more than squad players) with a little per-name
 * jitter. Not real data — clearly an estimate.
 */
export function estimatedValueM(name: string): number {
  const r = lineupRating(name);
  const base = 0.4 + Math.pow((r - 60) / 30, 3.2) * 135;
  const jitter = 0.85 + (hash('val:' + name) % 30) / 100; // 0.85..1.14
  const v = base * jitter;
  return v >= 20 ? Math.round(v) : Math.round(v * 10) / 10; // 1 dp under €20M
}

/** A simple formation label like "4-3-3" / "4-2-3-1" from the XI. */
export function formationOf(players: WcLineupPlayer[]): string {
  const counts: Record<WcPitchRow, number> = { GK: 0, DEF: 0, DM: 0, MID: 0, AM: 0, FWD: 0 };
  for (const p of players) if (p.starter) counts[pitchRow(p.pos)]++;
  return (['DEF', 'DM', 'MID', 'AM', 'FWD'] as WcPitchRow[])
    .map((r) => counts[r])
    .filter((n) => n > 0)
    .join('-');
}

/** Lay the XI out on the half-pitch: each player gets x/y, rating and value. */
export function placeLineup(lineup: WcLineup): WcPlacedPlayer[] {
  const starters = lineup.players.filter((p) => p.starter);
  const byRow = new Map<WcPitchRow, WcLineupPlayer[]>();
  for (const p of starters) {
    const row = pitchRow(p.pos);
    (byRow.get(row) ?? byRow.set(row, []).get(row)!).push(p);
  }
  const out: WcPlacedPlayer[] = [];
  for (const row of ROW_ORDER) {
    const inRow = (byRow.get(row) ?? []).sort(
      (a, b) =>
        sideOf(a.pos) - sideOf(b.pos) || (a.formationPlace ?? 99) - (b.formationPlace ?? 99),
    );
    inRow.forEach((player, i) => {
      const x = inRow.length === 1 ? 0.5 : 0.14 + (i / (inRow.length - 1)) * 0.72;
      out.push({
        player,
        row,
        x,
        y: ROW_Y[row],
        rating: lineupRating(player.name),
        valueM: estimatedValueM(player.name),
      });
    });
  }
  return out;
}

/** Total estimated squad value (€M) of the starting XI. */
export function teamValueM(lineup: WcLineup): number {
  const total = lineup.players
    .filter((p) => p.starter)
    .reduce((sum, p) => sum + estimatedValueM(p.name), 0);
  return Math.round(total * 10) / 10;
}
