/**
 * Starting-XI lineup model: classify each player's role, lay them out on a
 * half-pitch, and attach our own ability rating + their market value. The lineup,
 * positions and formation are real (from ESPN); values come from the committed
 * Transfermarkt DB (`marketValueM`) and fall back to a deterministic house
 * estimate only for players we don't carry. Pure + serialisable so it unit-tests
 * and runs anywhere.
 */

import { marketValueM } from './transfermarktValues.js';
import type { WcMatchEvent } from './worldcup.js';

/** A player's market value (€M): real Transfermarkt value when we have it, else a
 * deterministic house estimate so every player still shows a sensible number. */
export function playerValueM(name: string): number {
  return marketValueM(name) ?? estimatedValueM(name);
}

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
  /** Market value in €M — real Transfermarkt value when known, else an estimate. */
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

/** Deterministic 62–91 "house" number, used only to shape the *estimated* value
 * of players we don't carry a real Transfermarkt value for. */
function houseRating(name: string): number {
  return 62 + (hash('rate:' + name) % 30);
}

/**
 * Ability rating on a 0–100 scale (shown as /10), **grounded in the market
 * value** so it tracks Transfermarkt rather than being an arbitrary house
 * number: a log curve where ≈€200M → 94, €100M → 89, €50M → 84, €15M → 76,
 * €5M → 69, €1M → 62, clamped to 50–95. Same value ⇒ same rating, everywhere.
 */
export function ratingFromValueM(valueM: number): number {
  const r = 57 + 16 * Math.log10(Math.max(0, valueM) + 1);
  return Math.round(Math.max(50, Math.min(95, r)));
}

/** A player's ability rating (0–100, shown as /10), derived from their market
 * value — real Transfermarkt value when we have it, else the house estimate. */
export function lineupRating(name: string): number {
  return ratingFromValueM(playerValueM(name));
}

/**
 * A plausible, deterministic *estimated* market value (€M) for players we don't
 * carry a real value for, on a steep curve (stars worth far more than squad
 * players) with a little per-name jitter, capped so even the top tops out around
 * real-world territory (≈€90M, hard cap €110M). Not real data — an estimate, and
 * only ever a fallback behind the Transfermarkt DB.
 */
export function estimatedValueM(name: string): number {
  const r = houseRating(name); // 62..91
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

/**
 * Lay the XI out on the half-pitch. Within a row, players are ordered by lane
 * (left → centre → right, so a right-back is never flipped with a centre-back),
 * then spread across a band **whose width grows with the row size**: a 4-man
 * back line spreads to the touchlines, while a 2-man midfield pivot stays
 * central (even when ESPN labels it "LM/RM"). y is the role's band.
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
    const inRow = [...(byRow.get(row) ?? [])].sort(
      (a, b) =>
        laneOf(a.pos) - laneOf(b.pos) || (a.formationPlace ?? 99) - (b.formationPlace ?? 99),
    );
    const n = inRow.length;
    const width = Math.min(0.84, 0.26 * (n - 1)); // wider line ⇒ wider spread
    inRow.forEach((player, i) => {
      const x = n === 1 ? 0.5 : 0.5 - width / 2 + (i / (n - 1)) * width;
      out.push({
        player,
        row,
        x,
        y: ROW_Y[row],
        rating: lineupRating(player.name),
        valueM: playerValueM(player.name),
      });
    });
  }
  return out;
}

export interface WcPlayerTally {
  goals: number;
  assists: number;
  yellow: number;
  red: number;
}

/** A player's World Cup goals / assists / cards, summed from the match events
 * (matched by name). Own goals don't count as goals. */
export function tallyPlayerEvents(events: WcMatchEvent[], name: string): WcPlayerTally {
  // Match the feed's display names best-effort: accent- and dot-insensitive,
  // accepting an exact match or a "first-initial + surname" one ("L. Messi" ↔
  // "Lionel Messi"), so squad names line up with the live feed's names.
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').toLowerCase().trim();
  const target = norm(name);
  const parts = target.split(/\s+/).filter(Boolean);
  const surname = parts[parts.length - 1] ?? '';
  const initial = parts[0]?.[0] ?? '';
  const isPlayer = (p?: string): boolean => {
    if (!p) return false;
    const n = norm(p);
    if (n === target) return true;
    const np = n.split(/\s+/).filter(Boolean);
    return (
      surname.length > 2 && (np[np.length - 1] ?? '') === surname && (np[0]?.[0] ?? '') === initial
    );
  };
  const t: WcPlayerTally = { goals: 0, assists: 0, yellow: 0, red: 0 };
  for (const e of events) {
    if (isPlayer(e.player)) {
      if (e.kind === 'goal' || e.kind === 'pen-goal') t.goals++;
      else if (e.kind === 'yellow') t.yellow++;
      else if (e.kind === 'red') t.red++;
    }
    if (isPlayer(e.assist)) t.assists++;
  }
  return t;
}

/** Total squad value (€M) of the starting XI — real Transfermarkt values where we
 * have them, the house estimate otherwise. */
export function teamValueM(lineup: WcLineup): number {
  const total = lineup.players
    .filter((p) => p.starter)
    .reduce((sum, p) => sum + playerValueM(p.name), 0);
  return Math.round(total * 10) / 10;
}
