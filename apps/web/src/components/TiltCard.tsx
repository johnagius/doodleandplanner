import { useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

/**
 * Map a normalised pointer position within a card (0..1 on each axis) to the
 * CSS custom properties that drive the 3D tilt and the cursor-tracking glare.
 * Pure + deterministic so it can be unit-tested without the DOM.
 */
export function tiltVars(px: number, py: number, max: number): Record<string, string> {
  return {
    '--ry': `${(px - 0.5) * 2 * max}deg`,
    '--rx': `${(0.5 - py) * 2 * max}deg`,
    '--mx': `${px * 100}%`,
    '--my': `${py * 100}%`,
  };
}

/**
 * A card that tilts in 3D toward the pointer with a soft glare that tracks the
 * cursor. Driven entirely by CSS custom properties (no per-frame React state),
 * so it's cheap. Skips touch/pen and is disabled under prefers-reduced-motion.
 */
export function TiltCard({
  className,
  children,
  max = 7,
}: {
  className?: string;
  children: ReactNode;
  /** Maximum tilt in degrees on each axis. */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    // Tilt is a fine-pointer affordance; allow mouse + unknown, skip touch/pen.
    if (reduced || e.pointerType === 'touch' || e.pointerType === 'pen') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const vars = tiltVars(px, py, max);
    for (const [key, value] of Object.entries(vars)) el.style.setProperty(key, value);
    el.style.setProperty('--tilt', '1');
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--tilt', '0');
  }

  return (
    <div
      ref={ref}
      className={['tilt', className].filter(Boolean).join(' ')}
      onPointerMove={handleMove}
      onPointerLeave={reset}
    >
      {children}
    </div>
  );
}
