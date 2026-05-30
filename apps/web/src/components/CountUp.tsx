import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number counting up to `value` when it changes. Falls back to the
 * static value under prefers-reduced-motion. `format` renders the final string.
 */
export function CountUp({
  value,
  durationMs = 600,
  format = (n) => String(Math.round(n)),
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  // The value currently on screen — so an animation interrupted mid-flight
  // resumes from where it is rather than snapping back to its old start.
  const displayRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const from = displayRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs, reduced]);

  return <span>{format(display)}</span>;
}
