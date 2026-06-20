/**
 * The "⚽ GOAL!" beat for the Match Room: when the live score ticks up, flash a
 * burst, pop my own provisional points change, and (if sound is on) fire a
 * crowd roar + haptic. The standings reshuffle is handled by LiveBoard's FLIP —
 * this just owns the moment. Points shown are a *display* of the frozen
 * scorePrediction output (before vs after the goal); nothing is recomputed.
 */
import { scorePrediction, type WcMatch, type WorldCupState } from '@dap/shared';
import { useCallback, useRef, useState } from 'react';
import { useGoalEvents, type WcGoalDiff } from './liveGoals.js';
import { playSound, vibrate } from './wcSound.js';

interface Flash {
  id: number;
  score: string;
  pts: number | null;
}

export function GoalOverlay({
  wc,
  match,
  meId,
}: {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
}) {
  const [flash, setFlash] = useState<Flash | null>(null);
  const idRef = useRef(0);

  const onGoal = useCallback(
    (g: WcGoalDiff) => {
      // My provisional points swing from this goal — read-only use of scoring.
      let pts: number | null = null;
      if (meId) {
        const pick = wc.predictions.find((p) => p.matchId === match.id && p.predictorId === meId);
        if (pick) {
          pts = scorePrediction(pick, g.total).points - scorePrediction(pick, g.prevTotal).points;
        }
      }
      idRef.current += 1;
      const id = idRef.current;
      setFlash({ id, score: `${g.total.home}–${g.total.away}`, pts });
      playSound('goal');
      vibrate([40, 30, 90]);
      window.setTimeout(() => setFlash((f) => (f && f.id === id ? null : f)), 2600);
    },
    [wc, match.id, meId],
  );

  useGoalEvents(match.id, onGoal);

  if (!flash) return null;
  return (
    <div className="wc-goal-flash" role="status" aria-live="assertive">
      <span className="wc-goal-word">⚽ GOAL!</span>
      <span className="wc-goal-score">{flash.score}</span>
      {flash.pts != null && flash.pts !== 0 && (
        <span className={`wc-goal-pts ${flash.pts > 0 ? 'up' : 'down'}`}>
          {flash.pts > 0 ? `+${flash.pts}` : flash.pts} pts for you
        </span>
      )}
    </div>
  );
}
