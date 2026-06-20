/**
 * The kick-off beat for the Cinema: the moment a match we're watching goes live
 * (a real not-started → IN_PLAY transition, *not* the second-half restart), flash
 * a brief "Kick-off!" and blow a single whistle — the opening bookend to the
 * Half-Time / Full-Time whistles. The first render baselines silently, so opening
 * the Cinema on a game already in play never fires a false cue. Pure presentation;
 * rides the same opt-in sound toggle and scoring is untouched.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { playSound, vibrate } from './wcSound.js';

export function KickoffCue({ matchId }: { matchId: string }) {
  const status = useWorldCupStore((s) => s.live[matchId]?.status);
  const [show, setShow] = useState(false);
  const prev = useRef<string | null | undefined>(undefined);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = status;
    if (before === undefined) return; // baseline on mount — no cue
    const kickedOff = status === 'IN_PLAY' && before !== 'IN_PLAY' && before !== 'PAUSED';
    if (!kickedOff) return;
    setShow(true);
    playSound('whistle');
    vibrate([70]);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2600);
  }, [status]);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  if (!show) return null;
  return (
    <div className="wc-kickoff" role="status" aria-live="polite">
      <span className="wc-kickoff-word">🟢 Kick-off!</span>
    </div>
  );
}
