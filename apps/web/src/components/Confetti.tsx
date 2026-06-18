import { useEffect, useState } from 'react';

/** Festive palette for the confetti pieces. */
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  size: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * A one-shot confetti burst rained from the top of the viewport. Bump `fireKey`
 * (any increasing number) to (re)launch it; it self-clears after the fall.
 * Renders nothing for reduced-motion users, and `fireKey === 0` is the idle
 * state so a first paint never fires.
 */
export function Confetti({ fireKey, count = 90 }: { fireKey: number; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (fireKey === 0 || prefersReducedMotion()) return;
    const next: Piece[] = Array.from({ length: count }, (_, i) => ({
      id: fireKey * 1000 + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.8 + Math.random() * 1.2,
      color: COLORS[i % COLORS.length]!,
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 8,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 3200);
    return () => clearTimeout(t);
  }, [fireKey, count]);

  if (pieces.length === 0) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--rot' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}
