import { describe, expect, it } from 'vitest';
import {
  bestCells,
  buildGrid,
  gridRows,
  setCells,
  tallyGrid,
  toggleCell,
  type GridSpec,
} from '../src/grid.js';

const spec: GridSpec = {
  startDay: '2026-06-01T00:00:00.000Z',
  days: 3,
  startHour: 9,
  endHour: 12,
  slotMinutes: 60,
};

describe('buildGrid', () => {
  it('lays out days × time slots', () => {
    const cells = buildGrid(spec);
    expect(cells).toHaveLength(3 * 3); // 3 days × 3 hourly slots
    expect(gridRows(spec)).toBe(3);
    // First cell is day 0, 09:00.
    expect(cells[0]).toMatchObject({ col: 0, row: 0, start: '2026-06-01T09:00:00.000Z' });
    // Second cell is the next hour.
    expect(cells[1]!.start).toBe('2026-06-01T10:00:00.000Z');
    // Fourth cell jumps to the next day, 09:00.
    expect(cells[3]).toMatchObject({ col: 1, row: 0, start: '2026-06-02T09:00:00.000Z' });
  });

  it('returns nothing for degenerate specs', () => {
    expect(buildGrid({ ...spec, days: 0 })).toEqual([]);
    expect(buildGrid({ ...spec, endHour: 9 })).toEqual([]);
    expect(gridRows({ ...spec, endHour: 9 })).toBe(0);
  });
});

describe('toggle / set / tally', () => {
  it('toggles a cell on and off', () => {
    let grids = {};
    grids = toggleCell(grids, 'a', 'c1');
    expect(grids).toEqual({ a: ['c1'] });
    grids = toggleCell(grids, 'a', 'c1');
    expect(grids).toEqual({ a: [] });
  });

  it('sets many cells at once and de-dupes', () => {
    let grids = setCells({}, 'a', ['c1', 'c2', 'c1'], true);
    expect(new Set(grids['a'])).toEqual(new Set(['c1', 'c2']));
    grids = setCells(grids, 'a', ['c1'], false);
    expect(grids['a']).toEqual(['c2']);
  });

  it('tallies availability per cell', () => {
    const cells = buildGrid(spec);
    const first = cells[0]!.id;
    const second = cells[1]!.id;
    const grids = { a: [first, second], b: [first] };
    const tally = tallyGrid(cells, grids, ['a', 'b']);
    expect(tally.get(first)!.count).toBe(2);
    expect(tally.get(first)!.available.sort()).toEqual(['a', 'b']);
    expect(tally.get(second)!.count).toBe(1);
    // Untouched cells tally to zero.
    expect(tally.get(cells[2]!.id)!.count).toBe(0);
  });
});

describe('bestCells', () => {
  it('ranks by count then earliest start, dropping empties', () => {
    const cells = buildGrid(spec);
    const [c0, c1, c2] = [cells[0]!.id, cells[1]!.id, cells[2]!.id];
    const grids = {
      a: [c0, c1, c2],
      b: [c1, c2],
      c: [c2],
    };
    const best = bestCells(cells, grids, ['a', 'b', 'c'], 3);
    expect(best[0]).toMatchObject({ cellId: c2, count: 3 });
    expect(best[1]).toMatchObject({ cellId: c1, count: 2 });
    expect(best[2]).toMatchObject({ cellId: c0, count: 1 });
  });

  it('returns empty when nobody is available', () => {
    expect(bestCells(buildGrid(spec), {}, ['a'])).toEqual([]);
  });
});
