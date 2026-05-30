/**
 * Availability grid — the data model behind a Doodle-style week × time matrix.
 *
 * The grid is a set of fixed-duration cells laid out as columns (days) × rows
 * (times of day). Each member marks the cells they're available for; the UI
 * renders a heatmap of how many people are free per cell and surfaces the best
 * cells. Everything here is pure and serialisable.
 */
import { addMinutes, toISO, toMs } from './time.js';
import type { AvailabilityGrid, GridSpec, ISODateTime } from './types.js';

export type { AvailabilityGrid, GridSpec } from './types.js';

export interface GridCell {
  /** Stable id, derived from the start instant. */
  id: string;
  start: ISODateTime;
  end: ISODateTime;
  /** Column index (day) and row index (time slot). */
  col: number;
  row: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the ordered list of cells for a grid spec. */
export function buildGrid(spec: GridSpec): GridCell[] {
  const { startDay, days, startHour, endHour, slotMinutes } = spec;
  if (days <= 0 || slotMinutes <= 0 || endHour <= startHour) return [];
  const dayStartMs = toMs(startDay);
  const rowsPerDay = Math.floor(((endHour - startHour) * 60) / slotMinutes);
  const cells: GridCell[] = [];
  for (let col = 0; col < days; col++) {
    const colMidnight = dayStartMs + col * DAY_MS;
    for (let row = 0; row < rowsPerDay; row++) {
      const start = toISO(colMidnight + startHour * 60 * 60 * 1000 + row * slotMinutes * 60_000);
      const end = addMinutes(start, slotMinutes);
      cells.push({ id: start, start, end, col, row });
    }
  }
  return cells;
}

/** Rows count for a spec (handy for layout). */
export function gridRows(spec: GridSpec): number {
  if (spec.endHour <= spec.startHour || spec.slotMinutes <= 0) return 0;
  return Math.floor(((spec.endHour - spec.startHour) * 60) / spec.slotMinutes);
}

export interface CellTally {
  cellId: string;
  /** Member ids available for this cell. */
  available: string[];
  count: number;
}

/** Tally how many members are available per cell. */
export function tallyGrid(
  cells: GridCell[],
  grids: AvailabilityGrid,
  memberIds: string[],
): Map<string, CellTally> {
  const byCell = new Map<string, CellTally>();
  for (const cell of cells) byCell.set(cell.id, { cellId: cell.id, available: [], count: 0 });
  for (const memberId of memberIds) {
    for (const cellId of grids[memberId] ?? []) {
      const t = byCell.get(cellId);
      if (t) {
        t.available.push(memberId);
        t.count++;
      }
    }
  }
  return byCell;
}

/** Toggle a member's availability for a cell, returning a new grid map. */
export function toggleCell(
  grids: AvailabilityGrid,
  memberId: string,
  cellId: string,
): AvailabilityGrid {
  const current = grids[memberId] ?? [];
  const has = current.includes(cellId);
  return {
    ...grids,
    [memberId]: has ? current.filter((c) => c !== cellId) : [...current, cellId],
  };
}

/** Set (add or remove) a member's availability for many cells at once. */
export function setCells(
  grids: AvailabilityGrid,
  memberId: string,
  cellIds: string[],
  available: boolean,
): AvailabilityGrid {
  const current = new Set(grids[memberId] ?? []);
  for (const id of cellIds) {
    if (available) current.add(id);
    else current.delete(id);
  }
  return { ...grids, [memberId]: [...current] };
}

export interface BestCell {
  cellId: string;
  start: ISODateTime;
  end: ISODateTime;
  count: number;
}

/** The cells with the most availability, best first (ties: earliest). */
export function bestCells(
  cells: GridCell[],
  grids: AvailabilityGrid,
  memberIds: string[],
  limit = 3,
): BestCell[] {
  const tally = tallyGrid(cells, grids, memberIds);
  return cells
    .map((c) => ({ cellId: c.id, start: c.start, end: c.end, count: tally.get(c.id)?.count ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || toMs(a.start) - toMs(b.start))
    .slice(0, limit);
}
