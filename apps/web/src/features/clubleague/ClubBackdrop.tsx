/**
 * A sophisticated, original brand motif for the Club Football hero: a slowly
 * rotating "constellation sphere" — nodes arranged on three tilted orbital rings
 * that read as a globe of stars, over a soft radial glow. It nods to the
 * stars-forming-a-ball idea without copying any real competition's mark. Pure
 * SVG + CSS, decorative only (aria-hidden), and it sits behind the hero content.
 */
export function ClubBackdrop() {
  // Evenly spaced nodes around a ring; the ring group is tilted + rotated in CSS.
  const ringNodes = (count: number, r: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a), i };
    });

  const rings = [
    { nodes: ringNodes(18, 78), cls: 'cx-ring-a' },
    { nodes: ringNodes(14, 60), cls: 'cx-ring-b' },
    { nodes: ringNodes(10, 40), cls: 'cx-ring-c' },
  ];

  return (
    <div className="club-backdrop" aria-hidden>
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="cxGlow" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.30" />
            <stop offset="55%" stopColor="var(--accent-2, #a855f7)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cxRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent, #ec4899)" />
          </linearGradient>
        </defs>

        <rect width="200" height="200" fill="url(#cxGlow)" />

        <g className="club-sphere">
          {rings.map((ring) => (
            <g key={ring.cls} className={`cx-ring ${ring.cls}`}>
              <ellipse
                cx="100"
                cy="100"
                rx={ring.nodes[0] ? Math.hypot(ring.nodes[0].x - 100, ring.nodes[0].y - 100) : 60}
                ry={ring.nodes[0] ? Math.hypot(ring.nodes[0].x - 100, ring.nodes[0].y - 100) : 60}
                fill="none"
                stroke="url(#cxRing)"
                strokeWidth="0.4"
                strokeOpacity="0.35"
              />
              {ring.nodes.map((n) => (
                <circle
                  key={n.i}
                  cx={n.x}
                  cy={n.y}
                  r={n.i % 3 === 0 ? 1.5 : 0.9}
                  fill="url(#cxRing)"
                />
              ))}
            </g>
          ))}
          <circle cx="100" cy="100" r="2.4" fill="#fff" fillOpacity="0.9" className="cx-core" />
        </g>
      </svg>
    </div>
  );
}
