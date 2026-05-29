import { findMember, MEMBER_PALETTE, type Point, type Stroke, type StrokeTool } from '@dap/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyCursor, isCursor, pruneCursors, type CursorMap } from '../../lib/presence.js';
import { getRepository } from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';

const HEIGHT = 460;
const ERASER_COLOR = '#ffffff';
const NO_NOTES: never[] = []; // stable empty reference to avoid render loops

type Tool = StrokeTool | 'note';

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'pen', icon: '✏️', label: 'Pen' },
  { id: 'line', icon: '╱', label: 'Line' },
  { id: 'rect', icon: '▭', label: 'Rectangle' },
  { id: 'ellipse', icon: '◯', label: 'Ellipse' },
  { id: 'eraser', icon: '🧽', label: 'Eraser' },
  { id: 'note', icon: '🗒️', label: 'Sticky note' },
];

/** Render one stroke/shape onto the 2D context (coords are normalised 0..1). */
function paintStroke(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stroke: Pick<Stroke, 'color' | 'width' | 'points' | 'tool'>,
) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  const tool = stroke.tool ?? 'pen';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const ax = a.x * w;
  const ay = a.y * h;
  const bx = b.x * w;
  const by = b.y * h;

  if (tool === 'rect') {
    ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    return;
  }
  if (tool === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      (ax + bx) / 2,
      (ay + by) / 2,
      Math.abs(bx - ax) / 2,
      Math.abs(by - ay) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    return;
  }
  if (tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    return;
  }
  // pen / eraser: freehand polyline
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(ax, ay, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x * w, pts[i]!.y * h);
  ctx.stroke();
}

export function DoodleCanvas() {
  const strokes = useRoomStore((s) => s.state!.doodle.strokes);
  const notes = useRoomStore((s) => s.state!.doodle.notes ?? NO_NOTES);
  const slug = useRoomStore((s) => s.state!.room.slug);
  const meId = useRoomStore((s) => s.meId)!;
  const me = useRoomStore((s) => findMember(s.state!.room, meId));
  const { draw, undoDoodle, clearDoodle, addNote, moveNote, removeNote } = useRoomStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const current = useRef<Point[]>([]);
  const lastSent = useRef(0);
  const toolRef = useRef<Tool>('pen');

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(me?.color ?? MEMBER_PALETTE[5]);
  const [width, setWidth] = useState(4);
  const [cursors, setCursors] = useState<CursorMap>({});
  const [dragNote, setDragNote] = useState<string | null>(null);

  toolRef.current = tool;

  useEffect(() => {
    const repo = getRepository();
    if (!repo.subscribePresence) return;
    const unsub = repo.subscribePresence(slug, (payload) => {
      if (isCursor(payload) && payload.memberId !== meId) {
        setCursors((m) => applyCursor(m, payload));
      }
    });
    const interval = window.setInterval(() => setCursors((m) => pruneCursors(m, Date.now())), 1000);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [slug, meId]);

  function publishCursor(p: Point) {
    const repo = getRepository();
    if (!repo.publishPresence || !me) return;
    const now = Date.now();
    if (now - lastSent.current < 50) return;
    lastSent.current = now;
    repo.publishPresence(slug, {
      memberId: meId,
      name: me.name,
      color: me.color,
      x: p.x,
      y: p.y,
      at: now,
    });
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const stroke of strokes) paintStroke(ctx, w, h, stroke);
    if (current.current.length > 0) {
      const t = toolRef.current;
      const drawTool: StrokeTool = t === 'note' ? 'pen' : t;
      paintStroke(ctx, w, h, {
        color: t === 'eraser' ? ERASER_COLOR : color,
        width,
        points: current.current,
        tool: drawTool,
      });
    }
  }, [strokes, color, width]);

  useEffect(() => {
    redraw();
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [redraw]);

  function toPoint(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  async function onPointerDown(e: React.PointerEvent) {
    const p = toPoint(e);
    if (tool === 'note') {
      const text = window.prompt('Sticky note text');
      if (text?.trim()) await addNote({ text, color, x: p.x, y: p.y });
      return;
    }
    drawing.current = true;
    current.current = [p];
    canvasRef.current?.setPointerCapture(e.pointerId);
    redraw();
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toPoint(e);
    publishCursor(p);
    if (!drawing.current) return;
    const isShape = tool === 'line' || tool === 'rect' || tool === 'ellipse';
    if (isShape) current.current = [current.current[0]!, p];
    else current.current.push(p);
    redraw();
  }

  async function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const points = current.current;
    current.current = [];
    if (points.length === 0) return;
    const isShape = tool === 'line' || tool === 'rect' || tool === 'ellipse';
    if (isShape && points.length < 2) {
      redraw();
      return;
    }
    await draw({
      color: tool === 'eraser' ? ERASER_COLOR : color,
      width,
      points,
      tool: tool === 'note' ? 'pen' : tool,
    });
  }

  // Sticky-note dragging.
  function onNotePointerDown(e: React.PointerEvent, noteId: string) {
    e.stopPropagation();
    setDragNote(noteId);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onNotePointerMove(e: React.PointerEvent) {
    if (!dragNote) return;
    const host = canvasRef.current?.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    void moveNote(dragNote, x, y);
  }
  function onNotePointerUp() {
    setDragNote(null);
  }

  return (
    <div className="stack">
      <div
        className="card row spread row-wrap"
        style={{ padding: '0.6rem 0.9rem', gap: '0.75rem' }}
      >
        <div className="row row-wrap" role="group" aria-label="Tools" style={{ gap: '0.25rem' }}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn btn-sm ${tool === t.id ? 'btn-primary' : ''}`}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              title={t.label}
              onClick={() => setTool(t.id)}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="row row-wrap" style={{ gap: '0.4rem' }}>
          {MEMBER_PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: c,
                border: color === c ? '3px solid var(--text)' : '2px solid #fff',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
        <label className="row small" style={{ gap: '0.5rem' }}>
          Size
          <input
            type="range"
            min={1}
            max={32}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            aria-label="Brush size"
          />
        </label>
        <div className="row">
          <button className="btn btn-sm" onClick={() => undoDoodle()}>
            ↩ Undo
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm('Clear the whole doodle for everyone?')) clearDoodle();
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
        onPointerMove={onNotePointerMove}
        onPointerUp={onNotePointerUp}
      >
        <canvas
          ref={canvasRef}
          data-testid="doodle-canvas"
          style={{
            width: '100%',
            height: HEIGHT,
            display: 'block',
            touchAction: 'none',
            cursor: tool === 'note' ? 'copy' : 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        {notes.map((n) => (
          <div
            key={n.id}
            className="sticky-note"
            data-testid="sticky-note"
            style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, background: n.color }}
            onPointerDown={(e) => onNotePointerDown(e, n.id)}
          >
            <button
              className="sticky-note-x"
              aria-label="Delete note"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeNote(n.id)}
            >
              ×
            </button>
            <span>{n.text}</span>
          </div>
        ))}

        {Object.values(cursors).map((c) => (
          <div
            key={c.memberId}
            className="remote-cursor"
            data-testid="remote-cursor"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            <span className="remote-cursor-dot" style={{ background: c.color }} />
            <span className="remote-cursor-label" style={{ background: c.color }}>
              {c.name}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Sketch the venue, draw the route, add sticky notes — everyone draws on the same board, live.
      </p>
    </div>
  );
}
