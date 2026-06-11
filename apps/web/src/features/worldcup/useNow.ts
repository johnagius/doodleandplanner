import { useEffect, useState } from 'react';

/** Current epoch-ms, re-rendering on a steady tick so countdowns and the
 * kicked-off/locked state stay live without each card owning its own clock. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
