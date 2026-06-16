import {
  expectedGoals,
  findPredictor,
  findTeam,
  outcomeChances,
  scenarioBoard,
  scorelineChance,
  type WcLiveSnapshot,
  type WcMatch,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { type WcLiveInfo } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import { ScoreStepper } from './ScoreStepper.js';

/** Percent label: a whole number, or 1 dp under 10% so long shots aren't "0%". */
function pct(p: number): string {
  const v = p * 100;
  return `${v < 10 && v > 0 ? v.toFixed(1) : Math.round(v)}%`;
}

function Movement({ n }: { n: number }) {
  if (n > 0) return <span className="wc-move up">▲{n}</span>;
  if (n < 0) return <span className="wc-move down">▼{-n}</span>;
  return <span className="wc-move flat">–</span>;
}

/**
 * "What if?" tab: pick a final score for this match and see the leaderboard
 * re-rank — who climbs, who gets pipped — plus the live probability of that score
 * from the ESPN odds, conditioned on the current score + minutes left.
 */
export function ScenariosView({
  wc,
  match,
  live,
  meId,
}: {
  wc: WorldCupState;
  match: WcMatch;
  live?: WcLiveInfo;
  meId: string | null;
}) {
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const inPlay =
    !!live && live.home != null && (live.status === 'IN_PLAY' || live.status === 'PAUSED');
  const snap: WcLiveSnapshot | null = inPlay
    ? { minute: live!.minute, home: live!.home!, away: live!.away ?? 0 }
    : null;

  const [h, setH] = useState(() => snap?.home ?? 1);
  const [a, setA] = useState(() => snap?.away ?? 0);

  const odds = live?.odds ?? wc.odds?.[match.id] ?? null;
  const model = expectedGoals(odds);
  const rows = scenarioBoard(wc, match.id, h, a);
  const exact = scorelineChance(model, { home: h, away: a }, snap);
  const outcome = outcomeChances(model, snap);
  const belowLive = !!snap && (h < snap.home || a < snap.away);
  const topName = rows[0]?.name;

  return (
    <div className="stack wc-scenarios">
      <p className="muted small" style={{ margin: 0 }}>
        Set a full-time score to see who climbs the leaderboard — and the live odds of it landing.
      </p>

      <div className="wc-scn-stepper">
        <span className="wc-scn-team">
          {home?.flag} {home?.id ?? 'Home'}
        </span>
        <ScoreStepper value={h} onChange={setH} label={`${home?.name ?? 'Home'} goals`} />
        <span className="wc-dash">–</span>
        <ScoreStepper value={a} onChange={setA} label={`${away?.name ?? 'Away'} goals`} />
        <span className="wc-scn-team">
          {away?.flag} {away?.id ?? 'Away'}
        </span>
      </div>

      <div className="wc-scn-prob">
        <div className="wc-scn-chance">
          {belowLive ? (
            <>
              Can’t finish {h}–{a} — already past it.
            </>
          ) : (
            <>
              Chance of{' '}
              <strong>
                {h}–{a}
              </strong>
              : <strong>{pct(exact)}</strong>
            </>
          )}
        </div>
        <div className="wc-scn-bar" aria-hidden>
          <span className="seg home" style={{ width: `${outcome.home * 100}%` }} />
          <span className="seg draw" style={{ width: `${outcome.draw * 100}%` }} />
          <span className="seg away" style={{ width: `${outcome.away * 100}%` }} />
        </div>
        <div className="wc-scn-legend muted small">
          <span>
            {home?.id} {pct(outcome.home)}
          </span>
          <span>Draw {pct(outcome.draw)}</span>
          <span>
            {away?.id} {pct(outcome.away)}
          </span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {snap
            ? `Live ${snap.home}–${snap.away}${live!.minute != null ? `, ${live!.minute}'` : ''} — updates as it plays.`
            : odds
              ? 'From the bookmakers’ odds.'
              : 'Rough estimate (no odds in yet).'}
        </p>
      </div>

      <div className="wc-scn-board">
        {rows.map((r) => (
          <div
            key={r.predictorId}
            className={`wc-scn-row ${r.predictorId === meId ? 'is-me' : ''} ${
              r.movement > 0 ? 'climbs' : r.movement < 0 ? 'slips' : ''
            }`}
          >
            <span className="wc-scn-rank">{r.rank}</span>
            <Avatar predictor={findPredictor(wc, r.predictorId)} size={22} />
            <span className="wc-scn-name">{r.name}</span>
            <Movement n={r.movement} />
            <span className="wc-scn-pts">
              {r.points}
              {r.gain > 0 && <span className="wc-scn-gain"> +{r.gain}</span>}
            </span>
          </div>
        ))}
      </div>
      {topName && (
        <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
          🔮 {h}–{a} ⇒ <strong>{topName}</strong> leads.
        </p>
      )}
    </div>
  );
}
