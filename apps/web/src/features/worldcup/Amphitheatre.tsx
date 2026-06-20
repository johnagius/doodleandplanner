/**
 * The amphitheatre — a 2.5D dusk bowl with a dominant screen and an intimate set
 * of ~10 big seats facing it (a private-screening feel, not a stadium). The
 * people actually on the site fill the seats centre-first; empty chairs invite
 * the rest. The screen content is passed as children. Pure presentation;
 * geometry lives in a 1000×600 viewBox stretched 1:1 onto the box so HTML avatars
 * line up exactly on the SVG seats.
 */
import { findPredictor, type WorldCupState } from '@dap/shared';
import type { ReactNode } from 'react';
import { Avatar } from './Avatar.js';
import type { Bubble } from './useCommentBubbles.js';
import type { Watcher } from './useWatchers.js';

const VW = 1000;
const VH = 600;
const CX = 500;
const CY = 300; // the stage line (screen base) the seats fan out from
// Two gentle seating arcs facing the screen: a bigger front row, a smaller back.
const ROWS: { rx: number; ry: number; n: number; w: number; spread: number; size: number }[] = [
  { rx: 470, ry: 210, n: 6, w: 56, spread: 1.32, size: 46 }, // front (nearest, biggest)
  { rx: 372, ry: 120, n: 4, w: 44, spread: 0.92, size: 38 }, // back
];
const CAP = ROWS.reduce((s, r) => s + r.n, 0); // 10 seats

function seatPt(rx: number, ry: number, u: number): { x: number; y: number } {
  return { x: CX + u * rx, y: CY + ry * Math.sqrt(Math.max(0, 1 - u * u)) };
}
function bottomArc(rx: number, ry: number): string {
  return `M ${CX - rx},${CY} A ${rx},${ry} 0 0 0 ${CX + rx},${CY}`;
}

interface Slot {
  x: number;
  y: number;
  w: number;
  size: number;
  order: number; // fill order: front row first, centre-out
}
interface SeatPerson {
  key: string;
  predictorId: string | null;
  name: string | null;
  isMe?: boolean;
}

// The ~10 seat positions, ordered front-centre first so a lone watcher sits
// dead-centre up front rather than marooned on an edge.
function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  ROWS.forEach((row, ri) => {
    for (let k = 0; k < row.n; k++) {
      const u = row.n <= 1 ? 0 : -row.spread / 2 + (k / (row.n - 1)) * row.spread;
      const pt = seatPt(row.rx, row.ry, u);
      slots.push({ x: pt.x, y: pt.y, w: row.w, size: row.size, order: ri * 10 + Math.abs(u) });
    }
  });
  return slots.sort((a, b) => a.order - b.order);
}

// A single empty chair (seen from behind): a magenta-rimmed seat-back on the deck.
function Chair({ x, y, w }: { x: number; y: number; w: number }) {
  const h = w * 0.74;
  return (
    <g className="wc-amph-chair">
      <rect
        x={x - w / 2}
        y={y - h}
        width={w}
        height={h}
        rx={w * 0.22}
        className="wc-amph-chair-back"
      />
      <rect
        x={x - w / 2}
        y={y - h * 0.34}
        width={w}
        height={h * 0.34}
        rx={w * 0.16}
        className="wc-amph-chair-seat"
      />
    </g>
  );
}

export function Amphitheatre({
  wc,
  me,
  watchers,
  bubbles,
  cheering = false,
  children,
}: {
  wc: WorldCupState;
  me: { id: string; name: string | null } | null;
  watchers: Watcher[];
  bubbles: Bubble[];
  cheering?: boolean;
  children: ReactNode;
}) {
  const bubbleBy = new Map(bubbles.map((b) => [b.authorId, b.text]));

  const audience: SeatPerson[] = [];
  const seen = new Set<string>();
  const add = (p: SeatPerson) => {
    if (!seen.has(p.key)) {
      seen.add(p.key);
      audience.push(p);
    }
  };
  if (me) add({ key: me.id, predictorId: me.id, name: me.name, isMe: true });
  for (const w of watchers) add({ key: w.memberId, predictorId: w.memberId, name: w.name });
  for (const b of bubbles) add({ key: b.authorId, predictorId: b.authorId, name: b.name });
  const people = audience.slice(0, CAP);

  const slots = buildSlots();
  const placed = people.map((p, i) => {
    const slot = slots[i]!;
    return {
      ...p,
      x: slot.x,
      y: slot.y,
      size: slot.size,
      bubble: p.predictorId ? bubbleBy.get(p.predictorId) : undefined,
    };
  });
  const emptySlots = slots.slice(people.length);

  // A scattering of deterministic stars in the dusk sky.
  const stars = Array.from({ length: 50 }, (_, i) => ({
    x: (i * 137.5) % VW,
    y: (i * 53) % (CY - 60),
    r: i % 5 === 0 ? 1.5 : 0.8,
  }));

  return (
    <div className={`wc-amph ${cheering ? 'is-cheering' : ''}`}>
      <svg
        className="wc-amph-bowl"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="wc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#070d33" />
            <stop offset="0.45" stopColor="#241d59" />
            <stop offset="0.78" stopColor="#7b3a60" />
            <stop offset="1" stopColor="#d27249" />
          </linearGradient>
          <radialGradient id="wc-bloom" cx="0.5" cy="0.32" r="0.5">
            <stop offset="0" stopColor="#ff4d9e" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ff4d9e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc-horizon" cx="0.5" cy="1" r="0.85">
            <stop offset="0" stopColor="#ffb86b" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#e0708a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#e0708a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc-vig" cx="0.5" cy="0.46" r="0.78">
            <stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="wc-spot" cx="0.5" cy="0.1" r="0.7">
            <stop offset="0" stopColor="#ffdcee" stopOpacity="0.5" />
            <stop offset="0.6" stopColor="#ff9ccb" stopOpacity="0.13" />
            <stop offset="1" stopColor="#ff9ccb" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="wc-deck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#241a40" />
            <stop offset="1" stopColor="#0c0820" />
          </linearGradient>
        </defs>

        {/* Sky, the screen's bloom into it, and the sunset horizon. */}
        <rect x="0" y="0" width={VW} height={CY + 30} fill="url(#wc-sky)" />
        <rect x="0" y="0" width={VW} height={CY} fill="url(#wc-bloom)" />
        <rect x="0" y={CY - 130} width={VW} height="170" fill="url(#wc-horizon)" />
        {stars.map((s, i) => (
          <circle key={`star${i}`} cx={s.x} cy={s.y} r={s.r} className="wc-amph-star" />
        ))}

        {/* Dark bowl floor. */}
        <path d={`M0,${CY} H${VW} V${VH} H0 Z`} fill="url(#wc-deck)" />

        {/* Two seating decks (glowing front edges) with the chairs upon them. */}
        {ROWS.map((row, ri) => (
          <path
            key={`deck${ri}`}
            d={bottomArc(row.rx, row.ry)}
            className="wc-amph-arc"
            style={{ opacity: 0.4 + ri * 0.12 }}
          />
        ))}
        {emptySlots.map((s, i) => (
          <Chair key={`chair${i}`} x={s.x} y={s.y} w={s.w} />
        ))}

        {/* Light spilling from the screen onto the seats. */}
        <ellipse
          className="wc-amph-spot"
          cx={CX}
          cy={CY + 4}
          rx={460}
          ry={300}
          fill="url(#wc-spot)"
        />
        {/* A one-shot roar wash when the crowd erupts. */}
        {cheering && <rect className="wc-amph-roar" x="0" y="0" width={VW} height={VH} />}
        {/* Edge vignette for depth. */}
        <rect x="0" y="0" width={VW} height={VH} fill="url(#wc-vig)" />
      </svg>

      <div className="wc-amph-screen">{children}</div>

      <div className="wc-amph-people">
        {placed.map((s) => (
          <div
            key={s.key}
            className={`wc-amph-person ${s.isMe ? 'is-me' : ''}`}
            style={{ left: `${(s.x / VW) * 100}%`, top: `${(s.y / VH) * 100}%` }}
            title={s.isMe ? 'You' : (s.name ?? 'Watching')}
          >
            {s.bubble && <span className="wc-amph-bubble">{s.bubble}</span>}
            {s.predictorId ? (
              <Avatar predictor={findPredictor(wc, s.predictorId) ?? null} size={s.size} />
            ) : (
              <span className="wc-amph-anon">
                {s.name ? s.name.slice(0, 1).toUpperCase() : '•'}
              </span>
            )}
            <span className="wc-amph-name">{s.isMe ? 'You' : (s.name ?? '')}</span>
          </div>
        ))}
      </div>

      <div className="wc-amph-watching">
        <span className="wc-amph-watching-dot" aria-hidden />
        {people.length} watching
      </div>
    </div>
  );
}
