/**
 * The Match Room before kickoff — turn the wait into an event: a big cinematic
 * countdown and a "picks locking in… 7 of 9 are in" ritual that names only who's
 * *still to pick* (never anyone's scoreline — picks stay hidden until kickoff).
 * An optional anthem sting plays once on open (opt-in; no-op when sound is off).
 */
import { pendingPredictors, predictionCount, type WcMatch, type WorldCupState } from '@dap/shared';
import { useEffect, useRef } from 'react';
import { Countdown } from './Countdown.js';
import { playSound } from './wcSound.js';

export function PreMatchHype({
  wc,
  match,
  now,
}: {
  wc: WorldCupState;
  match: WcMatch;
  now: number;
}) {
  const inCount = predictionCount(wc, match.id);
  const total = wc.predictors.length;
  const pending = pendingPredictors(wc, match.id, new Date(now)); // names only
  const pct = total ? Math.round((inCount / total) * 100) : 0;
  const toKick = new Date(match.kickoff).getTime() - now;

  // A one-shot anthem sting when the build-up opens (opt-in; silent by default).
  const stung = useRef(false);
  useEffect(() => {
    if (stung.current) return;
    stung.current = true;
    playSound('anthem');
  }, []);

  return (
    <div className="wc-hype">
      <div className="wc-hype-countdown">
        {toKick > 0 ? (
          <>
            <span className="wc-hype-kick">⏳ Kicks off in</span>
            <span className="wc-hype-clock">
              <Countdown kickoff={match.kickoff} now={now} />
            </span>
          </>
        ) : (
          <>
            <span className="wc-hype-kick">🔜 Kicking off</span>
            <span className="wc-hype-clock">Any moment</span>
          </>
        )}
      </div>

      <div className="wc-lockin-ritual">
        <div className="wc-lockin-head">
          <span>🗳 Picks locking in…</span>
          <strong>
            {inCount} of {total} in
          </strong>
        </div>
        <div className="wc-lockin-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        {pending.length > 0 && (
          <p className="muted small wc-lockin-pending">
            Still to pick: {pending.map((p) => p.name).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
