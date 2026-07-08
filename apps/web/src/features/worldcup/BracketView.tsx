import {
  WC_STAGE_LABEL,
  findMatch,
  findTeam,
  isMatchLocked,
  isMatchReady,
  matchDateKey,
  winnerOf,
  type WcMatch,
  type WcSource,
  type WcStage,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { ChampionPicker } from './ChampionPicker.js';
import { Countdown } from './Countdown.js';
import { ScoreStepper } from './ScoreStepper.js';
import { useNow } from './useNow.js';
import { formatDay, formatKickoff } from './wcFormat.js';

const ROUNDS: WcStage[] = ['r32', 'r16', 'qf', 'sf', 'final'];

/** A knockout bracket you can also predict from: each tie shows its Malta
 * kick-off time and a live countdown, and — once both teams are known and before
 * kick-off — lets you enter your scoreline right here. Picks save to the same
 * shared state as the fixtures list, so they appear there too, and the identical
 * "locked at kick-off" rule applies. */
export function BracketView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const predict = useWorldCupStore((s) => s.predict);
  const unpredict = useWorldCupStore((s) => s.unpredict);
  const now = useNow();
  const hasKnockout = wc.matches.some((m) => m.stage !== 'group' && (m.homeId || m.awayId));
  const third = findMatch(wc, 'third-1');

  // The single next knockout tie still to kick off — highlighted (with any
  // in-play ties) in green; finished ties go orange.
  const nextId = wc.matches
    .filter((m) => m.stage !== 'group' && !m.result && new Date(m.kickoff).getTime() > now)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())[0]?.id;

  const nodeProps = { wc, meId, now, predict, unpredict, nextId };

  // A round is "done" once every tie in it has a result. Done rounds start
  // collapsed to a thin strip so the live rounds (QF onward) fit without lots of
  // scrolling; tapping a round's header folds/unfolds it. Manual toggles win.
  const roundDone = (stage: WcStage): boolean => {
    const ms = wc.matches.filter((m) => m.stage === stage);
    return ms.length > 0 && ms.every((m) => m.result);
  };
  const [collapsed, setCollapsed] = useState<Set<WcStage>>(
    // Only auto-collapse earlier rounds while a later one is still live, so we
    // never fold everything once the whole bracket is done.
    () => new Set(ROUNDS.filter((s) => roundDone(s) && ROUNDS.some((l) => !roundDone(l)))),
  );
  const toggleRound = (stage: WcStage) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });

  return (
    <div className="stack">
      <ChampionPicker wc={wc} />
      {!hasKnockout && (
        <p className="muted small">
          The bracket fills in automatically once group results are entered — the group winners,
          runners-up and best third-placed teams drop into their slots. You can predict each tie
          here as soon as both teams are known.
        </p>
      )}
      <div className="wc-bracket-scroll">
        <div className="wc-bracket">
          {ROUNDS.map((stage) => {
            const matches = wc.matches
              .filter((m) => m.stage === stage)
              .sort((a, b) => a.order - b.order);
            if (collapsed.has(stage)) {
              return (
                <button
                  key={stage}
                  type="button"
                  className="wc-bracket-col-collapsed"
                  onClick={() => toggleRound(stage)}
                  title={`Show ${WC_STAGE_LABEL[stage]}`}
                  aria-label={`Show ${WC_STAGE_LABEL[stage]}`}
                  aria-expanded={false}
                >
                  <span aria-hidden>▸</span>
                  <span className="wc-bracket-collapsed-label">{WC_STAGE_LABEL[stage]}</span>
                  <span className="wc-bracket-collapsed-count">{matches.length}</span>
                </button>
              );
            }
            return (
              <div key={stage} className="wc-bracket-col">
                <button
                  type="button"
                  className="wc-bracket-head wc-bracket-head-btn"
                  onClick={() => toggleRound(stage)}
                  title={`Hide ${WC_STAGE_LABEL[stage]}`}
                  aria-label={`Hide ${WC_STAGE_LABEL[stage]}`}
                  aria-expanded={true}
                >
                  {WC_STAGE_LABEL[stage]} <span aria-hidden>▾</span>
                </button>
                {matches.map((m) => (
                  <div key={m.id} className="wc-bracket-cell">
                    <BracketNode match={m} {...nodeProps} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {third && (
        <div className="wc-third-block">
          <div className="wc-bracket-head">{WC_STAGE_LABEL.third}</div>
          <div className="wc-bracket-col" style={{ maxWidth: 240 }}>
            <BracketNode match={third} {...nodeProps} />
          </div>
        </div>
      )}
    </div>
  );
}

interface NodeProps {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
  now: number;
  /** Id of the next tie still to kick off, highlighted alongside any in-play. */
  nextId: string | undefined;
  predict: (matchId: string, home: number, away: number) => Promise<void>;
  unpredict: (matchId: string) => Promise<void>;
}

function BracketNode({ wc, match, meId, now, nextId, predict, unpredict }: NodeProps) {
  const { show } = useToast();
  const winner = winnerOf(match);
  const result = match.result;
  const ready = isMatchReady(match);
  const locked = isMatchLocked(match, new Date(now));
  const canPredict = ready && !locked && !!meId;
  // Light status tint: finished → orange, in-play or next-up → green.
  const stateClass = result
    ? 'is-finished'
    : ready && locked
      ? 'is-live'
      : match.id === nextId
        ? 'is-next'
        : '';
  const myPick = meId
    ? wc.predictions.find((p) => p.matchId === match.id && p.predictorId === meId)
    : undefined;
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);

  async function save(homeGoals: number, awayGoals: number) {
    try {
      await predict(match.id, Math.max(0, homeGoals), Math.max(0, awayGoals));
      show('Pick saved ✓');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save pick');
    }
  }

  async function clearPick() {
    try {
      await unpredict(match.id);
      show('Pick removed');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not remove pick');
    }
  }

  return (
    <div className={`wc-bracket-node ${result ? 'played' : ''} ${stateClass}`}>
      <Slot
        team={home}
        source={match.homeSource}
        isWinner={!!winner && winner === match.homeId}
        result={result?.home}
        canPredict={canPredict}
        pickValue={myPick?.home}
        onChange={(n) => save(n, myPick?.away ?? 0)}
        label={`${home?.name ?? 'Home'} goals`}
      />
      <Slot
        team={away}
        source={match.awaySource}
        isWinner={!!winner && winner === match.awayId}
        result={result?.away}
        canPredict={canPredict}
        pickValue={myPick?.away}
        onChange={(n) => save(myPick?.home ?? 0, n)}
        label={`${away?.name ?? 'Away'} goals`}
      />

      {match.kickoff && (
        <div className="wc-bracket-meta">
          <span className="wc-bracket-time" title="Kick-off (Malta time)">
            🕒 {formatDay(matchDateKey(match))} · {formatKickoff(match.kickoff)}
          </span>
          {result ? (
            <span className="badge badge-success wc-bracket-badge">FT</span>
          ) : locked ? (
            <span className="badge badge-warn wc-bracket-badge">🔒</span>
          ) : (
            <Countdown kickoff={match.kickoff} now={now} />
          )}
          {canPredict && myPick && (
            <button
              type="button"
              className="wc-bracket-clear"
              onClick={clearPick}
              title="Clear my pick"
              aria-label="Clear my pick"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {!result && !myPick && ready && !locked && !meId && (
        <div className="wc-bracket-mypick muted small">Pick your name to predict.</div>
      )}
    </div>
  );
}

/** One team row: flag, name, and — on the right — its scoreline cell, which is
 * the final/result number, an inline stepper while you can still predict, or your
 * locked pick once kicked off. Keeping the number beside the name stays compact. */
function Slot({
  team,
  source,
  isWinner,
  result,
  canPredict,
  pickValue,
  onChange,
  label,
}: {
  team: WcTeam | undefined;
  source: WcSource | undefined;
  isWinner: boolean;
  result: number | undefined;
  canPredict: boolean;
  pickValue: number | undefined;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className={`wc-bracket-slot ${isWinner ? 'is-winner' : ''} ${team ? '' : 'is-tbd'}`}>
      <span className="wc-bracket-flag" aria-hidden>
        {team ? team.flag : '•'}
      </span>
      <span className="wc-bracket-team" title={team?.name ?? shortSource(source)}>
        {team ? team.name : shortSource(source)}
      </span>
      {result != null ? (
        <span className="wc-bracket-score">{result}</span>
      ) : canPredict ? (
        <ScoreStepper value={pickValue ?? 0} onChange={onChange} label={label} />
      ) : pickValue != null ? (
        <span className="wc-bracket-score wc-bracket-pickval" title="Your pick">
          {pickValue}
        </span>
      ) : null}
    </div>
  );
}

/** Compact placeholder for an unresolved slot, e.g. "1A", "2B", "3rd", "W QF1". */
function shortSource(source: WcSource | undefined): string {
  if (!source) return 'TBD';
  switch (source.kind) {
    case 'winner-group':
      return `1${source.group}`;
    case 'runner-group':
      return `2${source.group}`;
    case 'best-third':
      return source.thirdGroups?.length ? `3rd ${source.thirdGroups.join('/')}` : '3rd';
    case 'winner-match':
      return `W ${shortMatch(source.matchId)}`;
    case 'loser-match':
      return `L ${shortMatch(source.matchId)}`;
    default:
      return 'TBD';
  }
}

function shortMatch(matchId: string | undefined): string {
  if (!matchId) return '';
  const [stage, n] = matchId.split('-');
  const map: Record<string, string> = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF' };
  return `${map[stage ?? ''] ?? (stage ?? '').toUpperCase()}${n ? `-${n}` : ''}`;
}
