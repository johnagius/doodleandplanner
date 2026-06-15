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

/** Which band of the pitch a position abbreviation belongs to. ESPN suffixes a
 * side (e.g. "CF-L", "CD-R", "CM-L") — strip it so the base role drives the band
 * (otherwise "CF-L" was leaking into midfield, e.g. a 4-4-2 reading as "4-6"). */
export function pitchRow(pos: string): WcPitchRow {
  const p = pos.toUpperCase();
  if (p === 'G' || p.startsWith('GK')) return 'GK';
  const base = p.replace(/-[LR]$/, ''); // CF-L → CF, CM-R → CM
  if (base === 'SW') return 'DM'; // sweeper / single pivot — NOT a winger ("W")
  // Forwards: strikers, centre-forwards and wingers/wide-forwards. Listed
  // explicitly (no loose "contains W", which mis-caught the sweeper "SW").
  if (['ST', 'SS', 'CF', 'F', 'FW', 'LF', 'RF', 'LW', 'RW', 'W', 'WF'].includes(base)) {
    return 'FWD';
  }
  if (base.includes('AM') || base.includes('CAM')) return 'AM';
  if (base.includes('DM') || base.includes('CDM')) return 'DM';
  if (base.includes('M')) return 'MID';
  if (base.includes('B') || base.includes('D')) return 'DEF';
  return 'MID';
}

/**
 * Horizontal lane in −1..+1 from the position: full-backs/wingers hug the
 * touchline (±1), centre-left/right roles sit just off centre (±0.5), and
 * everything central is 0. Keeps two holding mids in the middle, not on the wings.
 */
function laneOf(pos: string): number {
  const p = pos.toUpperCase();
  if (['LB', 'LWB', 'LM', 'LW', 'LF'].includes(p)) return -1;
  if (['RB', 'RWB', 'RM', 'RW', 'RF'].includes(p)) return 1;
  if (p.endsWith('-L')) return -0.5;
  if (p.endsWith('-R')) return 0.5;
  if (p.startsWith('L') && p.length > 1) return -0.5;
  if (p.startsWith('R') && p.length > 1) return 0.5;
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
 * steep curve (stars worth far more than squad players) with a little per-name
 * jitter, capped so even a top rating tops out around real-world territory (≈
 * €90M, hard cap €110M) rather than the silly €150M+ it used to reach. Not real
 * data — clearly an estimate.
 */
export function estimatedValueM(name: string): number {
  const r = lineupRating(name); // 62..91
  const base = 0.3 + Math.pow((r - 60) / 31, 3) * 88; // ~0.3 (low) → ~88 (top)
  const jitter = 0.9 + (hash('val:' + name) % 20) / 100; // 0.90..1.09
  const v = Math.min(base * jitter, 110);
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

const clampX = (x: number) => Math.max(0.08, Math.min(0.92, x));

/**
 * Lay the XI out on the half-pitch. Each player's x comes from their position's
 * lane (so full-backs hug the line and centre-backs stay inner — no flipping a
 * right-back with a centre-back), and players who share a lane (e.g. two holding
 * mids, twin centre-backs) are nudged apart symmetrically rather than flung to
 * the touchlines. y is the role's band; rating + value are attached.
 */
export function placeLineup(lineup: WcLineup): WcPlacedPlayer[] {
  const starters = lineup.players.filter((p) => p.starter);
  const byRow = new Map<WcPitchRow, WcLineupPlayer[]>();
  for (const p of starters) {
    const row = pitchRow(p.pos);
    (byRow.get(row) ?? byRow.set(row, []).get(row)!).push(p);
  }
  const out: WcPlacedPlayer[] = [];
  for (const row of ROW_ORDER) {
    const inRow = byRow.get(row) ?? [];
    const based = inRow.map((player) => ({ player, bx: clampX(0.5 + laneOf(player.pos) * 0.4) }));
    // Group players that landed in the same lane, then fan them out around it.
    const groups = new Map<number, typeof based>();
    for (const b of based) {
      const key = Math.round(b.bx * 20);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => (a.player.formationPlace ?? 99) - (b.player.formationPlace ?? 99));
      const k = group.length;
      group.forEach((b, i) => {
        const x = k === 1 ? b.bx : clampX(b.bx + (i - (k - 1) / 2) * 0.2);
        out.push({
          player: b.player,
          row,
          x,
          y: ROW_Y[row],
          rating: lineupRating(b.player.name),
          valueM: estimatedValueM(b.player.name),
        });
      });
    }
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
