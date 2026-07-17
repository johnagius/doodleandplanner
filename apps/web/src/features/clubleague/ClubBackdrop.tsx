/**
 * The Club Football hero backdrop: a cinematic, poster-grade **starball** — a
 * sphere whose surface is tiled with silver star panels (the classic football-of-
 * stars), lit by a vertical stadium beam over a deep navy night sky. Original
 * geometry (a Fibonacci sphere of stars, front hemisphere, depth-shaded), not a
 * copy of any real mark. Pure SVG + CSS, decorative only.
 */

// Wide art so the hero reads as a poster band: the ball sits on the right (over
// the darker sky), leaving the left for the title. Anchored xMax so it survives
// a narrow (mobile) crop.
const VW = 400;
const VH = 120;
const CX = 316;
const CY = 60;
const R = 42; // sphere radius

/** SVG path for an upright 5-point star centred at (cx,cy). */
function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.4;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

/** Front-hemisphere star field on a sphere (deterministic Fibonacci lattice).
 * Edge stars shrink hard with depth so the curvature reads, and the whole set is
 * clipped to the sphere so the silhouette stays clean with dark navy gaps. */
function starField() {
  const N = 116;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const stars: { x: number; y: number; size: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2; // +1 (top) → −1 (bottom)
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * rad;
    const z = Math.sin(theta) * rad; // depth toward viewer
    if (z < 0.12) continue; // drop the rim clutter, leave a clean lit edge
    stars.push({
      x: CX + x * R * 0.9,
      y: CY - y * R * 0.9,
      size: R * 0.125 * (0.28 + 0.85 * z),
      z,
    });
  }
  return stars.sort((a, b) => a.z - b.z); // nearer stars drawn last
}

const STARS = starField();

export function ClubBackdrop() {
  return (
    <div className="club-backdrop" aria-hidden>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMaxYMid slice">
        <defs>
          <radialGradient id="cxSky" cx="50%" cy="34%" r="80%">
            <stop offset="0%" stopColor="#1b2a52" />
            <stop offset="45%" stopColor="#0e1730" />
            <stop offset="100%" stopColor="#070b18" />
          </radialGradient>
          <linearGradient id="cxBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0" />
            <stop offset="45%" stopColor="#bfdbfe" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="cxHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cxBall" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#2a3d6b" />
            <stop offset="55%" stopColor="#16233f" />
            <stop offset="100%" stopColor="#0a1120" />
          </radialGradient>
          <radialGradient id="cxStar" cx="42%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#e6edf7" />
            <stop offset="100%" stopColor="#9fb2cc" />
          </radialGradient>
          <linearGradient id="cxRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#dbeafe" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="cxShade" cx="62%" cy="70%" r="72%">
            <stop offset="0%" stopColor="#050912" stopOpacity="0.75" />
            <stop offset="55%" stopColor="#050912" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#050912" stopOpacity="0" />
          </radialGradient>
          <filter id="cxSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <clipPath id="cxClip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>

        <rect width={VW} height={VH} fill="url(#cxSky)" />

        {/* Stadium light beam */}
        <ellipse
          cx={CX}
          cy={CY}
          rx="16"
          ry="80"
          fill="url(#cxBeam)"
          filter="url(#cxSoft)"
          className="cx-beam"
        />
        {/* Ambient halo */}
        <circle cx={CX} cy={CY} r={R * 1.5} fill="url(#cxHalo)" className="cx-halo" />

        <g className="club-starball">
          {/* Sphere body */}
          <circle cx={CX} cy={CY} r={R} fill="url(#cxBall)" />
          {/* Star panels, clipped to the sphere so the silhouette stays clean */}
          <g clipPath="url(#cxClip)">
            {STARS.map((s, i) => (
              <path
                key={i}
                d={starPath(s.x, s.y, s.size)}
                fill="url(#cxStar)"
                opacity={0.45 + 0.55 * s.z}
              />
            ))}
            {/* Curvature shading (bottom-right falls into shadow) */}
            <circle cx={CX} cy={CY} r={R} fill="url(#cxShade)" />
            {/* Top-left specular highlight */}
            <ellipse
              cx={CX - R * 0.36}
              cy={CY - R * 0.42}
              rx={R * 0.52}
              ry={R * 0.34}
              fill="#ffffff"
              opacity="0.16"
              filter="url(#cxSoft)"
            />
          </g>
          {/* Bright rim light, then a fine dark edge for definition */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="url(#cxRim)" strokeWidth="1.4" />
          <circle
            cx={CX}
            cy={CY}
            r={R + 0.6}
            fill="none"
            stroke="#070b18"
            strokeWidth="1.2"
            opacity="0.6"
          />
        </g>

        {/* Ground glow */}
        <ellipse
          cx={CX}
          cy={CY + R + 22}
          rx="88"
          ry="16"
          fill="#3b82f6"
          opacity="0.16"
          filter="url(#cxSoft)"
        />
      </svg>
    </div>
  );
}
