import {
  WC_SCORE_LABEL,
  WC_STAGE_LABEL,
  findTeam,
  isMatchLocked,
  isMatchReady,
  pendingPredictors,
  scorePrediction,
  slotLabel,
  type WcMatch,
  type WcScoreCategory,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Countdown } from './Countdown.js';
import { MatchComments } from './MatchComments.js';
import { ScoreStepper } from './ScoreStepper.js';
import { useNow } from './useNow.js';
import { formatKickoff } from './wcFormat.js';

const POINT_CLASS: Record<WcScoreCategory, string> = {
  exact: 'wc-pts-exact',
  goalDiff: 'wc-pts-diff',
  outcome: 'wc-pts-outcome',
  close: 'wc-pts-close',
  miss: 'wc-pts-miss',
};

export function MatchCard({ matchId }: { matchId: string }) {
  const wc = useWorldCupStore((s) => s.state?.worldCup) ?? null;
  const meId = useWorldCupStore((s) => s.meId);
  const admin = useWorldCupStore((s) => s.admin);
  const live = useWorldCupStore((s) => s.live[matchId]);
  const { predict, unpredict } = useWorldCupStore();
  const { show } = useToast();
  const now = useNow();

  if (!wc) return null;
  const match = wc.matches.find((m) => m.id === matchId);
  if (!match) return null;

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const ready = isMatchReady(match);
  const locked = isMatchLocked(match, new Date(now));
  const result = match.result;
  const isLive = !result && !!live && (live.status === 'IN_PLAY' || live.status === 'PAUSED');
  // Who still hasn't predicted this open match (names only — not their picks).
  const stillToPick =
    !result && !locked && ready ? pendingPredictors(wc, matchId, new Date(now)) : [];
  const myPick = meId
    ? wc.predictions.find((p) => p.matchId === matchId && p.predictorId === meId)
    : undefined;

  const canPredict = ready && !locked && !!meId;

  async function adjust(side: 'home' | 'away', delta: number) {
    const h = (myPick?.home ?? 0) + (side === 'home' ? delta : 0);
    const a = (myPick?.away ?? 0) + (side === 'away' ? delta : 0);
    try {
      await predict(matchId, Math.max(0, h), Math.max(0, a));
      show('Pick saved ✓');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save pick');
    }
  }

  async function clearPick() {
    try {
      await unpredict(matchId);
      show('Pick removed');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not remove pick');
    }
  }

  const stageTag =
    match.stage === 'group'
      ? `Group ${match.group} · MD${match.matchday}`
      : WC_STAGE_LABEL[match.stage];

  return (
    <div className={`card wc-match ${result ? 'is-final' : ''}`}>
      <div className="wc-match-top">
        <span className="wc-stage-tag">{stageTag}</span>
        <span className="wc-meta">
          {formatKickoff(match.kickoff)}
          {match.venue ? ` · ${match.venue}` : ''}
        </span>
        {result ? (
          <span className="badge badge-success wc-ft">FT</span>
        ) : isLive ? (
          <span className="badge wc-ft wc-live">
            🔴 LIVE{live!.minute ? ` ${live!.minute}'` : ''}
          </span>
        ) : locked ? (
          <span className="badge badge-warn wc-ft">🔒 Kicked off</span>
        ) : (
          <Countdown kickoff={match.kickoff} now={now} />
        )}
      </div>

      <div className="wc-fixture">
        <TeamSide wc={wc} team={home} placeholder={slotLabel(wc, match.homeId, match.homeSource)} />

        <div className="wc-centre">
          {result ? (
            <div className="wc-scoreline" aria-label="Final score">
              <span>{result.home}</span>
              <span className="wc-dash">–</span>
              <span>{result.away}</span>
            </div>
          ) : isLive && live!.home != null ? (
            <div className="wc-scoreline wc-live-score" aria-label="Live score">
              <span>{live!.home}</span>
              <span className="wc-dash">–</span>
              <span>{live!.away}</span>
            </div>
          ) : canPredict ? (
            <div className="wc-pick-steppers">
              <ScoreStepper
                value={myPick?.home ?? 0}
                onChange={(n) => adjust('home', n - (myPick?.home ?? 0))}
                label={`${home?.name ?? 'Home'} goals`}
              />
              <span className="wc-dash">–</span>
              <ScoreStepper
                value={myPick?.away ?? 0}
                onChange={(n) => adjust('away', n - (myPick?.away ?? 0))}
                label={`${away?.name ?? 'Away'} goals`}
              />
            </div>
          ) : myPick ? (
            <div className="wc-scoreline muted" aria-label="Your locked pick">
              <span>{myPick.home}</span>
              <span className="wc-dash">–</span>
              <span>{myPick.away}</span>
            </div>
          ) : (
            <span className="wc-vs">v</span>
          )}
        </div>

        <TeamSide
          wc={wc}
          team={away}
          placeholder={slotLabel(wc, match.awayId, match.awaySource)}
          align="right"
        />
      </div>

      {result?.advancesId && (
        <div className="wc-pens muted small">
          {findTeam(wc, result.advancesId)?.name} won on penalties
        </div>
      )}

      {!result && myPick && (
        <div className="wc-clear-row">
          <span className="wc-saved">✓ Saved</span>
          <button type="button" className="btn btn-sm btn-ghost wc-clear-pick" onClick={clearPick}>
            ✕ Clear{locked ? ' (mistake)' : ' my pick'}
          </button>
        </div>
      )}
      {!result && canPredict && !myPick && (
        <p className="muted small wc-hint">Tap +/− to predict — it saves automatically.</p>
      )}
      {!result && !meId && ready && !locked && (
        <p className="muted small wc-hint">Pick your name above to predict this match.</p>
      )}
      {stillToPick.length > 0 && stillToPick.length < wc.predictors.length && (
        <p className="muted small wc-hint">
          ⏳ Still to pick: {stillToPick.map((p) => p.name).join(', ')}
        </p>
      )}

      <PredictionsRow wc={wc} match={match} meId={meId} revealed={locked} />

      <MatchComments matchId={match.id} />

      {admin && <ResultEditor wc={wc} match={match} />}
    </div>
  );
}

function TeamSide({
  team,
  placeholder,
  align,
}: {
  wc: WorldCupState;
  team: WcTeam | undefined;
  placeholder: string;
  align?: 'right';
}) {
  return (
    <div className={`wc-team ${align === 'right' ? 'wc-team-right' : ''}`}>
      <span className="wc-flag" aria-hidden>
        {team ? team.flag : '⚽'}
      </span>
      <span className={`wc-team-name ${team ? '' : 'muted'}`}>
        {team ? team.name : placeholder}
      </span>
    </div>
  );
}

function PredictionsRow({
  wc,
  match,
  meId,
  revealed,
}: {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
  /** Whether everyone's picks are shown (true once the match has kicked off). */
  revealed: boolean;
}) {
  const picks = wc.predictions.filter((p) => p.matchId === match.id);
  if (picks.length === 0) return null;
  // Stable order: by predictor list order.
  const order = new Map(wc.predictors.map((p, i) => [p.id, i]));
  picks.sort((a, b) => (order.get(a.predictorId) ?? 99) - (order.get(b.predictorId) ?? 99));

  // Until kickoff, hide everyone else's picks (no copying) — only your own shows.
  const shown = revealed ? picks : picks.filter((p) => p.predictorId === meId);
  const hidden = picks.length - shown.length;

  return (
    <div className="wc-picks">
      {shown.map((p) => {
        const name = wc.predictors.find((x) => x.id === p.predictorId)?.name ?? '?';
        const scored = match.result ? scorePrediction(p, match.result) : null;
        return (
          <span
            key={p.predictorId}
            className={`wc-pick-chip ${scored ? POINT_CLASS[scored.category] : ''} ${
              p.predictorId === meId ? 'is-me' : ''
            }`}
            title={scored ? WC_SCORE_LABEL[scored.category] : 'Prediction'}
          >
            <span className="wc-pick-name">{name}</span>
            <span className="wc-pick-score">
              {p.home}–{p.away}
            </span>
            {scored && <span className="wc-pick-pts">+{scored.points}</span>}
          </span>
        );
      })}
      {hidden > 0 && (
        <span className="wc-pick-chip wc-pick-hidden" title="Everyone’s picks reveal at kickoff">
          🔒 {hidden} more · hidden until kickoff
        </span>
      )}
    </div>
  );
}

function ResultEditor({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const { enterResult, clearMatchResult } = useWorldCupStore();
  const { show } = useToast();
  const [home, setHome] = useState(match.result?.home ?? 0);
  const [away, setAway] = useState(match.result?.away ?? 0);
  const [advancesId, setAdvancesId] = useState(match.result?.advancesId ?? '');

  const ready = isMatchReady(match);
  const isKnockout = match.stage !== 'group';
  const needsAdvance = isKnockout && home === away;

  async function save() {
    try {
      await enterResult(match.id, home, away, needsAdvance ? advancesId : undefined);
      show('Result saved ⚽');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save result');
    }
  }

  if (!ready) {
    return (
      <div className="wc-result-editor muted small">
        Result entry unlocks once both teams are known.
      </div>
    );
  }

  return (
    <div className="wc-result-editor">
      <span className="wc-result-label">Enter result</span>
      <div className="wc-result-controls">
        <ScoreStepper value={home} onChange={setHome} label="Home result goals" />
        <span className="wc-dash">–</span>
        <ScoreStepper value={away} onChange={setAway} label="Away result goals" />
        {needsAdvance && (
          <select
            className="select wc-advance"
            value={advancesId}
            onChange={(e) => setAdvancesId(e.target.value)}
            aria-label="Who advanced on penalties"
          >
            <option value="">Advances…</option>
            <option value={match.homeId}>{findTeam(wc, match.homeId)?.name} (pens)</option>
            <option value={match.awayId}>{findTeam(wc, match.awayId)?.name} (pens)</option>
          </select>
        )}
        <button className="btn btn-sm btn-primary" onClick={save}>
          Save
        </button>
        {match.result && (
          <button className="btn btn-sm btn-danger" onClick={() => clearMatchResult(match.id)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
