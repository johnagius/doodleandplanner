import {
  reversiLegalMoves,
  type Connect4Game,
  type DotsGame,
  type Member,
  type ReversiGame,
  type TicTacToeGame,
} from '@dap/shared';

const SEAT_MARKS = ['✕', '◯', '△', '◇'];

/** Colour for a seat, taken from the seated member when known. */
function seatColor(seat: number, memberFor: (seat: number) => Member | undefined): string {
  return memberFor(seat)?.color ?? ['#6366f1', '#ec4899', '#16a34a', '#d97706'][seat] ?? '#6366f1';
}

export function TicTacToeBoard({
  game,
  canMove,
  memberFor,
  onCell,
}: {
  game: TicTacToeGame;
  canMove: boolean;
  memberFor: (seat: number) => Member | undefined;
  onCell: (index: number) => void;
}) {
  return (
    <div className="ttt-board" role="group" aria-label="Tic-tac-toe board">
      {game.cells.map((cell, i) => {
        const taken = cell !== null;
        return (
          <button
            key={i}
            className="ttt-cell"
            aria-label={taken ? `Cell ${i + 1}, taken` : `Cell ${i + 1}, empty`}
            disabled={!canMove || taken}
            style={cell !== null ? { color: seatColor(cell, memberFor) } : undefined}
            onClick={() => onCell(i)}
          >
            {cell !== null ? SEAT_MARKS[cell] : ''}
          </button>
        );
      })}
    </div>
  );
}

export function Connect4Board({
  game,
  canMove,
  memberFor,
  onDrop,
}: {
  game: Connect4Game;
  canMove: boolean;
  memberFor: (seat: number) => Member | undefined;
  onDrop: (col: number) => void;
}) {
  const { cols, rows, cells } = game;
  return (
    <div className="c4-board" role="group" aria-label="Connect Four board">
      {Array.from({ length: cols }, (_, c) => {
        const full = cells[c] !== null; // top cell of this column occupied
        return (
          <button
            key={c}
            type="button"
            className="c4-col"
            disabled={!canMove || full}
            aria-label={full ? `Column ${c + 1}, full` : `Drop in column ${c + 1}`}
            onClick={() => onDrop(c)}
          >
            {Array.from({ length: rows }, (_, r) => {
              const v = cells[r * cols + c];
              return (
                <span key={r} className="c4-slot">
                  {v != null && (
                    <span className="c4-disc" style={{ background: seatColor(v, memberFor) }} />
                  )}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

export function ReversiBoard({
  game,
  canMove,
  memberFor,
  onCell,
}: {
  game: ReversiGame;
  canMove: boolean;
  memberFor: (seat: number) => Member | undefined;
  onCell: (index: number) => void;
}) {
  const legal = canMove ? new Set(reversiLegalMoves(game)) : new Set<number>();
  return (
    <div
      className="reversi-board"
      role="group"
      aria-label="Reversi board"
      style={{ gridTemplateColumns: `repeat(${game.size}, 1fr)` }}
    >
      {game.cells.map((cell, i) => {
        const isLegal = legal.has(i);
        return (
          <button
            key={i}
            type="button"
            className="reversi-cell"
            disabled={!isLegal}
            aria-label={
              cell !== null ? `Disc at ${i + 1}` : isLegal ? `Play ${i + 1}` : `Cell ${i + 1}`
            }
            onClick={() => onCell(i)}
          >
            {cell !== null && (
              <span className="reversi-disc" style={{ background: seatColor(cell, memberFor) }} />
            )}
            {cell === null && isLegal && <span className="reversi-hint" />}
          </button>
        );
      })}
    </div>
  );
}

const GAP = 64; // px between dots
const PAD = 22; // px around the grid

export function DotsBoard({
  game,
  canMove,
  memberFor,
  onEdge,
}: {
  game: DotsGame;
  canMove: boolean;
  memberFor: (seat: number) => Member | undefined;
  onEdge: (orient: 'h' | 'v', index: number) => void;
}) {
  const n = game.size;
  const dim = n * GAP + PAD * 2;
  const dotXY = (r: number, c: number) => ({ x: PAD + c * GAP, y: PAD + r * GAP });

  const hEdges = [];
  for (let row = 0; row <= n; row++) {
    for (let col = 0; col < n; col++) {
      const idx = row * n + col;
      const a = dotXY(row, col);
      const b = dotXY(row, col + 1);
      hEdges.push({ idx, drawn: game.hEdges[idx], a, b, orient: 'h' as const });
    }
  }
  const vEdges = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col <= n; col++) {
      const idx = row * (n + 1) + col;
      const a = dotXY(row, col);
      const b = dotXY(row + 1, col);
      vEdges.push({ idx, drawn: game.vEdges[idx], a, b, orient: 'v' as const });
    }
  }

  return (
    <svg
      className="dots-board"
      viewBox={`0 0 ${dim} ${dim}`}
      role="group"
      aria-label="Dots and boxes board"
    >
      {/* Claimed boxes (under the lines). */}
      {game.boxes.map((owner, i) => {
        if (owner === null) return null;
        const r = Math.floor(i / n);
        const c = i % n;
        const { x, y } = dotXY(r, c);
        const color = seatColor(owner, memberFor);
        return (
          <g key={`box-${i}`}>
            <rect
              x={x + 3}
              y={y + 3}
              width={GAP - 6}
              height={GAP - 6}
              rx={6}
              fill={color}
              opacity={0.22}
            />
            <text
              x={x + GAP / 2}
              y={y + GAP / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={GAP * 0.34}
              fontWeight={800}
              fill={color}
            >
              {memberFor(owner) ? SEAT_MARKS[owner] : ''}
            </text>
          </g>
        );
      })}

      {/* Edges: drawn ones solid, open ones faint with a fat invisible hit area. */}
      {[...hEdges, ...vEdges].map((e) => (
        <g key={`${e.orient}-${e.idx}`}>
          <line
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            className={e.drawn ? 'dots-edge drawn' : 'dots-edge open'}
          />
          {!e.drawn && canMove && (
            <line
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              className="dots-edge-hit"
              onClick={() => onEdge(e.orient, e.idx)}
            >
              <title>Draw line</title>
            </line>
          )}
        </g>
      ))}

      {/* Dots on top. */}
      {Array.from({ length: (n + 1) * (n + 1) }, (_, i) => {
        const r = Math.floor(i / (n + 1));
        const c = i % (n + 1);
        const { x, y } = dotXY(r, c);
        return <circle key={`dot-${i}`} cx={x} cy={y} r={4} className="dots-dot" />;
      })}
    </svg>
  );
}
