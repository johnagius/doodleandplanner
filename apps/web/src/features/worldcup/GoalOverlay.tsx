/**
 * The "⚽ GOAL!" beat for the Cinema: when the live score ticks up, flash a burst
 * naming the scorer + team (tinted the team's colour), pop my own provisional
 * points change, and (if sound is on) fire a crowd roar + haptic. The standings
 * reshuffle is handled elsewhere — this just owns the moment. Points shown are a
 * *display* of the frozen scorePrediction output (before vs after); nothing is
 * recomputed.
 */
import { findTeam, scorePrediction, type WcMatch, type WorldCupState } from '@dap/shared';
import { useCallback, useRef, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { useGoalEvents, type WcGoalDiff } from './liveGoals.js';
import { legibleScoreColor } from './wcFormat.js';
import { playSound, vibrate } from './wcSound.js';

interface Flash {
  id: number;
  score: string;
  scorer: string | null;
  team: string | null;
  color: string | undefined;
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
  const events = useWorldCupStore((s) => s.matchEvents[match.id]);
  const live = useWorldCupStore((s) => s.live[match.id]);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const liveRef = useRef(live);
  liveRef.current = live;

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
      // Name the scorer from the latest goal event for the team that just scored.
      const teamTla = g.side === 'home' ? match.homeId : match.awayId;
      const goals = (eventsRef.current ?? []).filter(
        (e) => (e.kind === 'goal' || e.kind === 'pen-goal') && e.teamTla === teamTla,
      );
      const scorer = goals.length ? (goals[goals.length - 1]!.player ?? null) : null;
      const team = findTeam(wc, teamTla)?.name ?? null;
      const color = legibleScoreColor(
        g.side === 'home' ? liveRef.current?.homeColor : liveRef.current?.awayColor,
      );

      idRef.current += 1;
      const id = idRef.current;
      setFlash({ id, score: `${g.total.home}–${g.total.away}`, scorer, team, color, pts });
      playSound('goal');
      vibrate([40, 30, 90]);
      window.setTimeout(() => setFlash((f) => (f && f.id === id ? null : f)), 2600);
    },
    [wc, match.id, match.homeId, match.awayId, meId],
  );

  useGoalEvents(match.id, onGoal);

  if (!flash) return null;
  return (
    <div className="wc-goal-flash" role="status" aria-live="assertive">
      <span className="wc-goal-word" style={flash.color ? { color: flash.color } : undefined}>
        ⚽ GOAL!
      </span>
      {(flash.scorer || flash.team) && (
        <span className="wc-goal-scorer">
          {flash.scorer ? `${flash.scorer} · ${flash.team ?? ''}` : flash.team}
        </span>
      )}
      <span className="wc-goal-score">{flash.score}</span>
      {flash.pts != null && flash.pts !== 0 && (
        <span className={`wc-goal-pts ${flash.pts > 0 ? 'up' : 'down'}`}>
          {flash.pts > 0 ? `+${flash.pts}` : flash.pts} pts for you
        </span>
      )}
    </div>
  );
}
