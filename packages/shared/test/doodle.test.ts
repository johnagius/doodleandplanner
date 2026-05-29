import { describe, expect, it } from 'vitest';
import {
  addNote,
  addStroke,
  clearBoard,
  moveNote,
  removeNote,
  removeStroke,
  strokeBounds,
  undoLastStroke,
} from '../src/doodle.js';
import type { DoodleBoard } from '../src/types.js';

function board(): DoodleBoard {
  return { id: 'd1', roomId: 'r', strokes: [] };
}

const stroke = (memberId: string) => ({
  memberId,
  color: '#ef4444',
  width: 3,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
  ],
});

describe('addStroke', () => {
  it('appends a stroke', () => {
    const b = addStroke(board(), stroke('m1'));
    expect(b.strokes).toHaveLength(1);
    expect(b.strokes[0]!.memberId).toBe('m1');
    expect(b.strokes[0]!.id).toMatch(/^stroke_/);
  });

  it('validates points and width', () => {
    expect(() => addStroke(board(), { ...stroke('m1'), points: [] })).toThrow(/at least one/);
    expect(() => addStroke(board(), { ...stroke('m1'), width: 0 })).toThrow(/width/);
  });
});

describe('undoLastStroke', () => {
  it('removes only the calling member’s most recent stroke', () => {
    let b = board();
    b = addStroke(b, stroke('m1'));
    b = addStroke(b, stroke('m2'));
    b = addStroke(b, stroke('m1'));
    const target = b.strokes[2]!.id;

    b = undoLastStroke(b, 'm1');
    expect(b.strokes).toHaveLength(2);
    expect(b.strokes.some((s) => s.id === target)).toBe(false);
    expect(b.strokes.some((s) => s.memberId === 'm2')).toBe(true);
  });

  it('is a no-op when the member has no strokes', () => {
    const b = addStroke(board(), stroke('m1'));
    expect(undoLastStroke(b, 'ghost').strokes).toHaveLength(1);
  });
});

describe('removeStroke & clearBoard', () => {
  it('removes a stroke by id and clears the board', () => {
    let b = addStroke(board(), stroke('m1'));
    const id = b.strokes[0]!.id;
    expect(removeStroke(b, id).strokes).toHaveLength(0);
    b = addStroke(b, stroke('m2'));
    expect(clearBoard(b).strokes).toHaveLength(0);
  });
});

describe('strokeBounds', () => {
  it('returns null for an empty board', () => {
    expect(strokeBounds(board())).toBeNull();
  });
  it('computes the bounding box', () => {
    let b = addStroke(board(), stroke('m1'));
    b = addStroke(b, { ...stroke('m2'), points: [{ x: 0.9, y: 0.05 }] });
    expect(strokeBounds(b)).toEqual({ minX: 0.1, minY: 0.05, maxX: 0.9, maxY: 0.4 });
  });
});

describe('tools', () => {
  it('defaults to pen and records the tool', () => {
    const b = addStroke(board(), { ...stroke('m1'), tool: 'rect' });
    expect(b.strokes[0]!.tool).toBe('rect');
    const pen = addStroke(board(), stroke('m1'));
    expect(pen.strokes[0]!.tool).toBe('pen');
  });

  it('requires two points for shapes', () => {
    expect(() =>
      addStroke(board(), { ...stroke('m1'), tool: 'line', points: [{ x: 0.1, y: 0.1 }] }),
    ).toThrow(/start and end/);
  });
});

describe('sticky notes', () => {
  it('adds, moves and removes notes', () => {
    let b = addNote(board(), {
      memberId: 'm1',
      text: '  Bring snacks  ',
      color: '#eab308',
      x: 0.2,
      y: 0.3,
    });
    expect(b.notes).toHaveLength(1);
    expect(b.notes![0]!.text).toBe('Bring snacks');
    const id = b.notes![0]!.id;

    b = moveNote(b, id, 0.5, 0.6);
    expect(b.notes![0]).toMatchObject({ x: 0.5, y: 0.6 });

    b = removeNote(b, id);
    expect(b.notes).toHaveLength(0);
  });

  it('rejects empty notes and clears notes with the board', () => {
    expect(() =>
      addNote(board(), { memberId: 'm', text: '  ', color: '#000', x: 0, y: 0 }),
    ).toThrow(/text/);
    let b = addNote(board(), { memberId: 'm', text: 'Hi', color: '#000', x: 0, y: 0 });
    b = addStroke(b, stroke('m'));
    b = clearBoard(b);
    expect(b.strokes).toHaveLength(0);
    expect(b.notes).toHaveLength(0);
  });
});
