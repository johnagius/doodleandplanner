/**
 * Hand-built, non-cartoon trophy + shield marks for the two titles. Metallic
 * gradients, highlights and rim shading so they read as real silverware rather
 * than emoji. Pure SVG; `size` sets the pixel box.
 */

export function TrophyIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Trophy">
      <defs>
        <linearGradient id="tphGold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fff2c2" />
          <stop offset="35%" stopColor="#f7c948" />
          <stop offset="70%" stopColor="#e09b1a" />
          <stop offset="100%" stopColor="#a9660b" />
        </linearGradient>
        <linearGradient id="tphGoldDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6a824" />
          <stop offset="100%" stopColor="#8a5209" />
        </linearGradient>
        <linearGradient id="tphShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Handles */}
      <path d="M17 15 C6 15 6 33 20 33 L20 28 C13 28 12 20 17 20 Z" fill="url(#tphGoldDark)" />
      <path d="M47 15 C58 15 58 33 44 33 L44 28 C51 28 52 20 47 20 Z" fill="url(#tphGoldDark)" />

      {/* Cup bowl */}
      <path
        d="M16 11 L48 11 L46 27 C46 36 40 41 32 41 C24 41 18 36 18 27 Z"
        fill="url(#tphGold)"
        stroke="#8a5209"
        strokeWidth="0.6"
      />
      {/* Bowl shine */}
      <path d="M22 14 L28 14 L25 30 C23 29 21 25 21 22 Z" fill="url(#tphShine)" opacity="0.7" />

      {/* Stem + base */}
      <rect x="29.5" y="41" width="5" height="7" fill="url(#tphGoldDark)" />
      <path
        d="M22 55 L42 55 L44 60 L20 60 Z"
        fill="url(#tphGold)"
        stroke="#8a5209"
        strokeWidth="0.6"
      />
      <rect x="26" y="48" width="12" height="4" rx="1" fill="url(#tphGoldDark)" />
    </svg>
  );
}

export function ShieldIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Shield">
      <defs>
        <linearGradient id="shMetal" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#eaf1fb" />
          <stop offset="42%" stopColor="#9db4d4" />
          <stop offset="100%" stopColor="#43597c" />
        </linearGradient>
        <linearGradient id="shInner" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="shShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shStar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c7d6ec" />
        </linearGradient>
      </defs>

      {/* Outer plate */}
      <path
        d="M32 4 L55 12 L55 32 C55 47 45 56 32 61 C19 56 9 47 9 32 L9 12 Z"
        fill="url(#shMetal)"
        stroke="#2c3e5c"
        strokeWidth="1"
      />
      {/* Inner field */}
      <path
        d="M32 10 L50 16 L50 32 C50 43 42 50 32 55 C22 50 14 43 14 32 L14 16 Z"
        fill="url(#shInner)"
        stroke="#dfe8f6"
        strokeWidth="0.8"
      />
      {/* Emblem star */}
      <path
        d="M32 20 L34.6 27.4 L42.5 27.6 L36.2 32.3 L38.4 39.9 L32 35.4 L25.6 39.9 L27.8 32.3 L21.5 27.6 L29.4 27.4 Z"
        fill="url(#shStar)"
      />
      {/* Left-edge highlight */}
      <path
        d="M32 6 L18 11 L18 30 C18 33 20 37 23 40 C17 35 14 30 14 24 L14 16 Z"
        fill="url(#shShine)"
        opacity="0.5"
      />
    </svg>
  );
}
