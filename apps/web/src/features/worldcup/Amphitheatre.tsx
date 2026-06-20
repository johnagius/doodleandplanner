/**
 * The amphitheatre — a 2.5D dusk bowl: a sunset sky behind a dominant screen,
 * then concentric seating decks fanning toward the viewer, packed with a
 * silhouette crowd and edged with magenta step-lights, with the people actually
 * on the site seated (bright, named) in the front rows. The screen content is
 * passed as children. Pure presentation; geometry lives in a 1000×600 viewBox
 * stretched 1:1 onto a 5:3 box so HTML avatars line up exactly on the SVG seats.
 */
import { findPredictor, type WorldCupState } from '@dap/shared';
import type { ReactNode } from 'react';
import { Avatar } from './Avatar.js';
import type { Bubble } from './useCommentBubbles.js';
import type { Watcher } from './useWatchers.js';

const VW = 1000;
const VH = 600;
const CX = 500;
const CY = 312; // the stage line (screen base) the decks fan out from
// Seating decks from back (nearest the screen) to front (nearest the viewer).
const TIERS: { rx: number; ry: number; seats: number }[] = [
  { rx: 250, ry: 48, seats: 22 },
  { rx: 332, ry: 94, seats: 30 },
  { rx: 414, ry: 140, seats: 38 },
  { rx: 498, ry: 184, seats: 46 },
  { rx: 582, ry: 220, seats: 54 },
];
const FRONT = TIERS.length - 1; // people sit on the front-most deck(s)

// Deterministic 0..1 hash so the crowd is stable across renders (no flicker).
function frac(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bottomArc(rx: number, ry: number): string {
  return `M ${CX - rx},${CY} A ${rx},${ry} 0 0 0 ${CX + rx},${CY}`;
}
function seatPt(rx: number, ry: number, u: number): { x: number; y: number } {
  return { x: CX + u * rx, y: CY + ry * Math.sqrt(Math.max(0, 1 - u * u)) };
}
// The filled seating deck between this tier's arc and the one behind it.
function deckPath(o: { rx: number; ry: number }, inner: { rx: number; ry: number } | null): string {
  const outer = `M ${CX - o.rx},${CY} A ${o.rx},${o.ry} 0 0 0 ${CX + o.rx},${CY}`;
  if (!inner) return `${outer} L ${CX},${CY} Z`;
  return `${outer} L ${CX + inner.rx},${CY} A ${inner.rx},${inner.ry} 0 0 1 ${CX - inner.rx},${CY} Z`;
}

interface Reserve {
  tier: number;
  uMin: number;
  uMax: number;
}
interface Spec {
  x: number;
  y: number;
  s: number;
  arms: boolean;
  fill: string;
  key: string;
}
interface SeatPerson {
  key: string;
  predictorId: string | null;
  name: string | null;
  isMe?: boolean;
}

// One ambient spectator: head + torso, base anchored at (0,0) so it "sits" on
// the deck. Drawn dark; the screen-light wash rims them from above. `fill`
// picks one of a few tints so the crowd isn't a flat monotone mass.
function Spectator({
  x,
  y,
  s,
  arms,
  fill,
}: {
  x: number;
  y: number;
  s: number;
  arms: boolean;
  fill: string;
}) {
  const bw = 3.3 * s;
  const bh = 6.2 * s;
  const hr = 2.4 * s;
  return (
    <g transform={`translate(${x} ${y})`}>
      {arms && (
        <>
          <line
            x1={-bw * 0.65}
            y1={-bh * 0.55}
            x2={-bw * 1.1}
            y2={-bh * 1.4}
            className="wc-amph-arm"
            strokeWidth={1.2 * s}
          />
          <line
            x1={bw * 0.65}
            y1={-bh * 0.55}
            x2={bw * 1.1}
            y2={-bh * 1.4}
            className="wc-amph-arm"
            strokeWidth={1.2 * s}
          />
        </>
      )}
      <path
        d={`M ${-bw},0 C ${-bw},${-bh * 0.5} ${-bw * 0.58},${-bh} 0,${-bh} C ${bw * 0.58},${-bh} ${bw},${-bh * 0.5} ${bw},0 Z`}
        fill={fill}
      />
      <circle cx={0} cy={-bh - hr * 0.45} r={hr} fill={fill} />
    </g>
  );
}
const SIL_FILLS = ['url(#wc-sil)', 'url(#wc-sil2)', 'url(#wc-sil3)'];

// Ambient spectators per deck, minus the slots reserved for the real (named)
// audience up front. Generated once per render — cheap and pure.
function buildCrowd(reserve: Reserve[]): Spec[][] {
  return TIERS.map((t, tier) => {
    const res = reserve.filter((r) => r.tier === tier);
    const row: Spec[] = [];
    for (let k = 0; k < t.seats; k++) {
      const u = t.seats <= 1 ? 0 : -0.97 + (k / (t.seats - 1)) * 1.94;
      if (res.some((r) => u >= r.uMin && u <= r.uMax)) continue;
      const h = frac(tier * 131.7 + k * 7.13);
      const uu = u + (frac(tier * 9.1 + k) - 0.5) * 0.012;
      const pt = seatPt(t.rx, t.ry, uu);
      const s = (1.35 + tier * 0.4) * (0.88 + h * 0.24);
      row.push({
        x: pt.x,
        y: pt.y - frac(k * 3.3) * 1.5,
        s,
        arms: h > 0.85,
        fill: SIL_FILLS[
          Math.floor(frac(tier * 5.7 + k * 2.1) * SIL_FILLS.length) % SIL_FILLS.length
        ]!,
        key: `c${tier}-${k}`,
      });
    }
    return row;
  });
}

export function Amphitheatre({
  wc,
  me,
  watchers,
  bubbles,
  children,
}: {
  wc: WorldCupState;
  me: { id: string; name: string | null } | null;
  watchers: Watcher[];
  bubbles: Bubble[];
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
  const people = audience.slice(0, 16);

  // Seat the real audience along the front row(s), centred, spilling into the
  // row behind once the front fills. Reserve those slots from the ambient crowd.
  const n = people.length;
  const twoRows = n > 9;
  const row0n = twoRows ? Math.ceil(n / 2) : n;
  const rowUs = (cnt: number): number[] => {
    const sp = Math.min(1.5, Math.max(0.42, cnt * 0.2));
    return Array.from({ length: cnt }, (_, i) => (cnt <= 1 ? 0 : -sp / 2 + (i / (cnt - 1)) * sp));
  };
  const us0 = rowUs(row0n);
  const us1 = rowUs(n - row0n);
  const reserve: Reserve[] = [];
  if (us0.length)
    reserve.push({ tier: FRONT, uMin: us0[0]! - 0.08, uMax: us0[us0.length - 1]! + 0.08 });
  if (us1.length)
    reserve.push({ tier: FRONT - 1, uMin: us1[0]! - 0.08, uMax: us1[us1.length - 1]! + 0.08 });

  const placeRow = (ids: SeatPerson[], us: number[], tier: number) =>
    ids.map((p, i) => {
      const pt = seatPt(TIERS[tier]!.rx, TIERS[tier]!.ry, us[i] ?? 0);
      return {
        ...p,
        x: pt.x,
        y: pt.y,
        bubble: p.predictorId ? bubbleBy.get(p.predictorId) : undefined,
      };
    });
  // Back row first so the front row paints over it where they overlap.
  const placed = [
    ...placeRow(people.slice(row0n), us1, FRONT - 1),
    ...placeRow(people.slice(0, row0n), us0, FRONT),
  ];

  const crowd = buildCrowd(reserve);

  // A scattering of deterministic stars in the dusk sky.
  const stars = Array.from({ length: 54 }, (_, i) => ({
    x: (i * 137.5) % VW,
    y: (i * 53) % (CY - 64),
    r: i % 5 === 0 ? 1.5 : 0.8,
  }));

  return (
    <div className="wc-amph">
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
          <radialGradient id="wc-bloom" cx="0.5" cy="0.36" r="0.5">
            <stop offset="0" stopColor="#ff4d9e" stopOpacity="0.42" />
            <stop offset="1" stopColor="#ff4d9e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc-horizon" cx="0.5" cy="1" r="0.85">
            <stop offset="0" stopColor="#ffb86b" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#e0708a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#e0708a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc-vig" cx="0.5" cy="0.46" r="0.78">
            <stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.62" />
          </radialGradient>
          <radialGradient id="wc-spot" cx="0.5" cy="0.12" r="0.72">
            <stop offset="0" stopColor="#ffdcee" stopOpacity="0.58" />
            <stop offset="0.55" stopColor="#ff9ccb" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ff9ccb" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="wc-deck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#241a40" />
            <stop offset="1" stopColor="#0c0820" />
          </linearGradient>
          <linearGradient id="wc-apron" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2350" stopOpacity="0.9" />
            <stop offset="1" stopColor="#0a0716" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wc-sil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a5e96" />
            <stop offset="0.5" stopColor="#2c2450" />
            <stop offset="1" stopColor="#0c0a20" />
          </linearGradient>
          <linearGradient id="wc-sil2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a6aa0" />
            <stop offset="0.5" stopColor="#252a52" />
            <stop offset="1" stopColor="#0a0c1e" />
          </linearGradient>
          <linearGradient id="wc-sil3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a5a8e" />
            <stop offset="0.5" stopColor="#3a2248" />
            <stop offset="1" stopColor="#10081c" />
          </linearGradient>
          <linearGradient id="wc-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2c5c" stopOpacity="0.55" />
            <stop offset="1" stopColor="#3a2c5c" stopOpacity="0" />
          </linearGradient>
          <filter id="wc-neon" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sky, the screen's bloom into it, and the sunset horizon. */}
        <rect x="0" y="0" width={VW} height={CY + 30} fill="url(#wc-sky)" />
        <rect x="0" y="0" width={VW} height={CY} fill="url(#wc-bloom)" />
        <rect x="0" y={CY - 130} width={VW} height="170" fill="url(#wc-horizon)" />
        {stars.map((s, i) => (
          <circle key={`star${i}`} cx={s.x} cy={s.y} r={s.r} className="wc-amph-star" />
        ))}

        {/* The dark bowl floor + the lit apron where stage meets the seats. */}
        <path d={`M0,${CY} H${VW} V${VH} H0 Z`} fill="#06040d" />
        <rect x="0" y={CY} width={VW} height="64" fill="url(#wc-apron)" />
        {/* Atmospheric haze over the back decks for depth. */}
        <rect x="0" y={CY} width={VW} height="120" fill="url(#wc-haze)" />

        {/* Per deck (back→front): filled seating deck, glowing front edge, then
            that deck's crowd — so nearer decks correctly overlap those behind. */}
        {TIERS.map((t, tier) => (
          <g key={`tier${tier}`}>
            <path
              d={deckPath(t, tier === 0 ? null : TIERS[tier - 1]!)}
              fill="url(#wc-deck)"
              opacity={0.72 + (tier % 2 === 0 ? 0.1 : 0)}
            />
            <path
              d={bottomArc(t.rx, t.ry)}
              className="wc-amph-arc"
              filter="url(#wc-neon)"
              style={{ opacity: 0.32 + tier * 0.07 }}
            />
            {crowd[tier]!.map((c) => (
              <Spectator key={c.key} x={c.x} y={c.y} s={c.s} arms={c.arms} fill={c.fill} />
            ))}
          </g>
        ))}

        {/* Light spilling from the screen, washing over the crowd. */}
        <ellipse
          className="wc-amph-spot"
          cx={CX}
          cy={CY + 6}
          rx={470}
          ry={310}
          fill="url(#wc-spot)"
        />
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
              <Avatar predictor={findPredictor(wc, s.predictorId) ?? null} size={30} />
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
