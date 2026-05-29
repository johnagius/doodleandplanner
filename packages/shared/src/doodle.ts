/** Collaborative drawing board: append-only strokes with per-member undo. */
import { generateId } from './ids.js';
import type { DoodleBoard, Point, StickyNote, Stroke, StrokeTool } from './types.js';

export interface AddStrokeInput {
  memberId: string;
  color: string;
  width: number;
  points: Point[];
  tool?: StrokeTool;
  now?: () => Date;
}

export function addStroke(board: DoodleBoard, input: AddStrokeInput): DoodleBoard {
  if (input.points.length === 0) throw new Error('A stroke needs at least one point');
  if (input.width <= 0) throw new Error('Stroke width must be positive');
  const tool = input.tool ?? 'pen';
  // Shapes are defined by two anchor points; require them.
  if ((tool === 'line' || tool === 'rect' || tool === 'ellipse') && input.points.length < 2) {
    throw new Error('Shapes need a start and end point');
  }

  const stroke: Stroke = {
    id: generateId('stroke'),
    memberId: input.memberId,
    color: input.color,
    width: input.width,
    points: input.points,
    tool,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  return { ...board, strokes: [...board.strokes, stroke] };
}

/** Remove the most recent stroke belonging to a member (their personal undo). */
export function undoLastStroke(board: DoodleBoard, memberId: string): DoodleBoard {
  let lastIndex = -1;
  for (let i = board.strokes.length - 1; i >= 0; i--) {
    if (board.strokes[i]!.memberId === memberId) {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex === -1) return board;
  return { ...board, strokes: board.strokes.filter((_, i) => i !== lastIndex) };
}

export function removeStroke(board: DoodleBoard, strokeId: string): DoodleBoard {
  return { ...board, strokes: board.strokes.filter((s) => s.id !== strokeId) };
}

export function clearBoard(board: DoodleBoard): DoodleBoard {
  return { ...board, strokes: [], notes: [] };
}

// --- Sticky notes ----------------------------------------------------------

export interface AddNoteInput {
  memberId: string;
  text: string;
  color: string;
  x: number;
  y: number;
  now?: () => Date;
}

export function addNote(board: DoodleBoard, input: AddNoteInput): DoodleBoard {
  const text = input.text.trim();
  if (!text) throw new Error('A note needs text');
  const note: StickyNote = {
    id: generateId('note'),
    memberId: input.memberId,
    text,
    color: input.color,
    x: input.x,
    y: input.y,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  return { ...board, notes: [...(board.notes ?? []), note] };
}

export function moveNote(board: DoodleBoard, noteId: string, x: number, y: number): DoodleBoard {
  return {
    ...board,
    notes: (board.notes ?? []).map((n) => (n.id === noteId ? { ...n, x, y } : n)),
  };
}

export function removeNote(board: DoodleBoard, noteId: string): DoodleBoard {
  return { ...board, notes: (board.notes ?? []).filter((n) => n.id !== noteId) };
}

/** Bounding box of all strokes in normalised coordinates, or null if empty. */
export function strokeBounds(
  board: DoodleBoard,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (board.strokes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of board.strokes) {
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}
