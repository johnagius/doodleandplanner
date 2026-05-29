import { findMember, MEMBER_PALETTE, type Point, type Stroke } from '@dap/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../../state/roomStore.js';

const HEIGHT = 460;

export function DoodleCanvas() {
  const strokes = useRoomStore((s) => s.state!.doodle.strokes);
  const meId = useRoomStore((s) => s.meId)!;
  const me = useRoomStore((s) => findMember(s.state!.room, meId));
  const { draw, undoDoodle, clearDoodle } = useRoomStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = useRef<Point[]>([]);

  const [color, setColor] = useState(me?.color ?? MEMBER_PALETTE[5]);
  const [width, setWidth] = useState(4);

  const drawStroke = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      stroke: Pick<Stroke, 'color' | 'width' | 'points'>,
    ) => {
      const pts = stroke.points;
      if (pts.length === 0) return;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0]!.x * w, pts[0]!.y * h, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x * w, pts[0]!.y * h);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x * w, pts[i]!.y * h);
      ctx.stroke();
    },
    [],
  );

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
    for (const stroke of strokes) drawStroke(ctx, w, h, stroke);
    if (current.current.length > 0)
      drawStroke(ctx, w, h, { color, width, points: current.current });
  }, [strokes, drawStroke, color, width]);

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

  function onPointerDown(e: React.PointerEvent) {
    drawing.current = true;
    current.current = [toPoint(e)];
    canvasRef.current?.setPointerCapture(e.pointerId);
    redraw();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    current.current.push(toPoint(e));
    redraw();
  }
  async function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const points = current.current;
    current.current = [];
    if (points.length > 0) await draw({ color, width, points });
  }

  return (
    <div className="stack">
      <div className="card row spread row-wrap" style={{ padding: '0.6rem 0.9rem' }}>
        <div className="row row-wrap" style={{ gap: '0.4rem' }}>
          {MEMBER_PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 26,
                height: 26,
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
          Brush
          <input
            type="range"
            min={1}
            max={24}
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

      <div ref={containerRef} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          data-testid="doodle-canvas"
          style={{
            width: '100%',
            height: HEIGHT,
            display: 'block',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Sketch the venue, the route, the seating plan — whatever helps. Everyone draws on the same
        board.
      </p>
    </div>
  );
}
