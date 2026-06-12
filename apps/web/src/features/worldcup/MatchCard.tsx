import {
  WC_REACTIONS,
  WC_SCORE_LABEL,
  WC_STAGE_LABEL,
  closestPredictors,
  consensusScore,
  findTeam,
  groupStandings,
  isMatchLocked,
  isMatchReady,
  pendingPredictors,
  predictionCount,
  scorePrediction,
  slotLabel,
  teamRecord,
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
  const [view, setView] = useState<CardView>('match');

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
  const isGroup = match.stage === 'group' && !!match.group;

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

      <CardViewTabs view={view} onChange={setView} showGroup={isGroup} />

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
          ) : canPredict && view === 'match' ? (
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
          ) : myPick && view === 'match' ? (
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

      {view === 'match' && (
        <>
          {!result && myPick && (
            <div className="wc-clear-row">
              <span className="wc-saved">✓ Saved</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost wc-clear-pick"
                onClick={clearPick}
              >
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

          <CrowdPulse wc={wc} match={match} />
          <PredictionsRow wc={wc} match={match} meId={meId} revealed={locked} />
          <MatchReactions wc={wc} match={match} meId={meId} />
          <MatchComments matchId={match.id} />
          {admin && <ResultEditor wc={wc} match={match} />}
        </>
      )}

      {view === 'stats' && <StatsView wc={wc} match={match} />}
      {view === 'group' && isGroup && <GroupView wc={wc} group={match.group!} match={match} />}
    </div>
  );
}

type CardView = 'match' | 'stats' | 'group';

const CARD_VIEWS: { id: CardView; icon: string; label: string }[] = [
  { id: 'match', icon: '⚽', label: 'Match' },
  { id: 'stats', icon: '📊', label: 'Stats' },
  { id: 'group', icon: '🔢', label: 'Group' },
];

/** The three little tabs in the card's top-right that switch its lower panel. */
function CardViewTabs({
  view,
  onChange,
  showGroup,
}: {
  view: CardView;
  onChange: (v: CardView) => void;
  showGroup: boolean;
}) {
  const views = showGroup ? CARD_VIEWS : CARD_VIEWS.filter((v) => v.id !== 'group');
  return (
    <div className="wc-card-tabs" role="tablist" aria-label="Card view">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          className={`wc-card-tab ${view === v.id ? 'active' : ''}`}
          onClick={() => onChange(v.id)}
          title={v.label}
          aria-label={v.label}
        >
          <span aria-hidden>{v.icon}</span>
        </button>
      ))}
    </div>
  );
}

function TeamSide({
  wc,
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
      <span className="wc-team-info">
        <span className={`wc-team-name ${team ? '' : 'muted'}`}>
          {team ? team.name : placeholder}
        </span>
        {team && <TeamContext wc={wc} teamId={team.id} />}
      </span>
    </div>
  );
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

/** Group position + recent W/D/L form for a team, from played results only.
 * Renders nothing until the team has actually played in the group. */
function TeamContext({ wc, teamId }: { wc: WorldCupState; teamId: string }) {
  const record = teamRecord(wc, teamId);
  if (!record || record.played === 0 || record.position == null) return null;
  return (
    <span className="wc-team-context">
      <span className="wc-team-pos" title={`Group ${record.group}`}>
        {ORDINALS[record.position] ?? `${record.position}th`}
      </span>
      <FormDots form={record.form} />
    </span>
  );
}

/** Coloured W/D/L pills for a team's recent results (most-recent-first). */
function FormDots({ form }: { form: Array<'W' | 'D' | 'L'> }) {
  if (form.length === 0) return <span className="muted small">—</span>;
  return (
    <span className="wc-form" aria-label={`Recent form ${form.join(' ')}`}>
      {form.slice(0, 5).map((r, i) => (
        <span key={i} className={`wc-form-dot wc-form-${r}`} aria-hidden>
          {r}
        </span>
      ))}
    </span>
  );
}

/** "Stats" view: the two teams' tournament form & record, side by side.
 * (Historical head-to-head is layered on in a later pass.) */
function StatsView({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  if (!home || !away) {
    return <p className="muted small wc-tab-empty">Teams are decided once the bracket fills in.</p>;
  }
  const hr = teamRecord(wc, home.id);
  const ar = teamRecord(wc, away.id);
  const anyPlayed = (hr?.played ?? 0) + (ar?.played ?? 0) > 0;

  const pos = (r: typeof hr) => (r?.position ? (ORDINALS[r.position] ?? `${r.position}th`) : '—');
  const wdl = (r: typeof hr) => (r ? `${r.won}–${r.drawn}–${r.lost}` : '—');
  const goals = (r: typeof hr) => (r ? `${r.goalsFor}–${r.goalsAgainst}` : '—');

  return (
    <div className="wc-statsview">
      <div className="wc-statsview-head">
        <span className="wc-flag" aria-hidden>
          {home.flag}
        </span>
        <span className="wc-statsview-title">Form &amp; record</span>
        <span className="wc-flag" aria-hidden>
          {away.flag}
        </span>
      </div>
      {anyPlayed ? (
        <table className="wc-cmp-table">
          <tbody>
            <CmpRow
              label={`Group ${hr?.group ?? away?.group ?? ''} position`}
              h={pos(hr)}
              a={pos(ar)}
            />
            <CmpRow label="Played" h={`${hr?.played ?? 0}`} a={`${ar?.played ?? 0}`} />
            <CmpRow label="W–D–L" h={wdl(hr)} a={wdl(ar)} />
            <CmpRow label="Goals (F–A)" h={goals(hr)} a={goals(ar)} />
            <CmpRow label="Points" h={`${hr?.points ?? 0}`} a={`${ar?.points ?? 0}`} strong />
            <tr>
              <td className="wc-cmp-h">
                <FormDots form={hr?.form ?? []} />
              </td>
              <th scope="row" className="wc-cmp-label">
                Form
              </th>
              <td className="wc-cmp-a">
                <FormDots form={ar?.form ?? []} />
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted small wc-tab-empty">
          No group games played yet — form and records appear once the group is underway.
        </p>
      )}
      <p className="muted small wc-h2h-note">⚔️ Head-to-head history is on the way.</p>
    </div>
  );
}

function CmpRow({
  label,
  h,
  a,
  strong,
}: {
  label: string;
  h: string;
  a: string;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? 'wc-cmp-strong' : ''}>
      <td className="wc-cmp-h">{h}</td>
      <th scope="row" className="wc-cmp-label">
        {label}
      </th>
      <td className="wc-cmp-a">{a}</td>
    </tr>
  );
}

/** "Group" view: the live standings for this match's group (top 2 highlighted),
 * with the two teams playing here emphasised. Permutations layer on later. */
function GroupView({ wc, group, match }: { wc: WorldCupState; group: string; match: WcMatch }) {
  const rows = groupStandings(wc, group);
  const here = new Set([match.homeId, match.awayId].filter(Boolean));
  return (
    <div className="wc-groupview">
      <div className="wc-statsview-head">
        <span className="wc-statsview-title">Group {group}</span>
      </div>
      <table className="wc-mini-table">
        <thead>
          <tr>
            <th aria-label="Position">#</th>
            <th className="wc-mini-team">Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = findTeam(wc, r.teamId);
            return (
              <tr
                key={r.teamId}
                className={`${i < 2 ? 'wc-qual' : ''} ${here.has(r.teamId) ? 'wc-here' : ''}`}
              >
                <td>{i + 1}</td>
                <td className="wc-mini-team">
                  <span aria-hidden>{t?.flag}</span> {t?.name ?? r.teamId}
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>
                  {r.goalDiff > 0 ? '+' : ''}
                  {r.goalDiff}
                </td>
                <td className="wc-mini-pts">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Top 2 advance; the best third-placed teams also go through.</p>
    </div>
  );
}

/** A little "crowd" read-out: how many are in before kickoff (a count only, no
 * picks revealed), and the most-popular scoreline once a result is in. */
function CrowdPulse({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const count = predictionCount(wc, match.id);
  if (count === 0) return null;

  if (match.result) {
    const consensus = consensusScore(wc, match.id);
    if (!consensus) return null;
    return (
      <div className="wc-pulse">
        <span className="wc-pulse-tag">Crowd pick</span>
        <span className="wc-pulse-score">
          {consensus.home}–{consensus.away}
        </span>
        <span className="muted small">
          {consensus.count} of {count}
        </span>
      </div>
    );
  }

  const total = wc.predictors.length;
  return (
    <div className="wc-pulse">
      <span className="wc-pulse-tag">🔮 Crowd</span>
      <span className="wc-pulse-meter" aria-hidden>
        {'●'.repeat(count)}
        {'○'.repeat(Math.max(0, total - count))}
      </span>
      <span className="muted small">
        {count} of {total} predicted
      </span>
    </div>
  );
}

/** Quick, prediction-free emoji reactions on a match (🔥😱🎉💩). */
function MatchReactions({
  wc,
  match,
  meId,
}: {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
}) {
  const { reactMatch } = useWorldCupStore();
  const { show } = useToast();
  const tally = wc.matchReactions?.[match.id] ?? {};

  async function react(emoji: string) {
    if (!meId) {
      show('Pick your name above to react');
      return;
    }
    try {
      await reactMatch(match.id, emoji);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not react');
    }
  }

  return (
    <div className="wc-reactions">
      {WC_REACTIONS.map((emoji) => {
        const who = tally[emoji] ?? [];
        const mine = !!meId && who.includes(meId);
        return (
          <button
            key={emoji}
            type="button"
            className={`wc-reaction ${mine ? 'mine' : ''}`}
            onClick={() => void react(emoji)}
            aria-pressed={mine}
            aria-label={`React ${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            {who.length > 0 && <span className="wc-reaction-count">{who.length}</span>}
          </button>
        );
      })}
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
  // Closest pick(s) get a 🎯 crown once the match is resolved.
  const crowned = match.result ? new Set(closestPredictors(wc, match.id)) : null;

  return (
    <div className="wc-picks">
      {shown.map((p) => (
        <PickChip
          key={p.predictorId}
          wc={wc}
          match={match}
          pick={p}
          meId={meId}
          crowned={crowned?.has(p.predictorId) ?? false}
          // You can react to a revealed pick that isn't your own.
          canReact={revealed && !!meId && p.predictorId !== meId}
        />
      ))}
      {hidden > 0 && (
        <span className="wc-pick-chip wc-pick-hidden" title="Everyone’s picks reveal at kickoff">
          🔒 {hidden} more · hidden until kickoff
        </span>
      )}
    </div>
  );
}

/** One predictor's pick chip, with its points/crown and (once revealed) the
 * ability to react to a mate's pick. */
function PickChip({
  wc,
  match,
  pick,
  meId,
  crowned,
  canReact,
}: {
  wc: WorldCupState;
  match: WcMatch;
  pick: WorldCupState['predictions'][number];
  meId: string | null;
  crowned: boolean;
  canReact: boolean;
}) {
  const { reactPick } = useWorldCupStore();
  const [picker, setPicker] = useState(false);
  const name = wc.predictors.find((x) => x.id === pick.predictorId)?.name ?? '?';
  const scored = match.result ? scorePrediction(pick, match.result) : null;
  const reactions = Object.entries(pick.reactions ?? {});

  return (
    <span className="wc-pick">
      <span
        className={`wc-pick-chip ${scored ? POINT_CLASS[scored.category] : ''} ${
          pick.predictorId === meId ? 'is-me' : ''
        }`}
        title={scored ? WC_SCORE_LABEL[scored.category] : 'Prediction'}
      >
        {crowned && (
          <span className="wc-pick-crown" title="Closest pick" aria-label="Closest pick">
            🎯
          </span>
        )}
        <span className="wc-pick-name">{name}</span>
        <span className="wc-pick-score">
          {pick.home}–{pick.away}
        </span>
        {scored && <span className="wc-pick-pts">+{scored.points}</span>}
      </span>

      {(reactions.length > 0 || canReact) && (
        <span className="wc-pick-reactions">
          {reactions.map(([emoji, who]) => (
            <button
              key={emoji}
              type="button"
              className={`reaction-chip ${meId && who.includes(meId) ? 'mine' : ''}`}
              onClick={() => {
                if (canReact) void reactPick(match.id, pick.predictorId, emoji);
              }}
              disabled={!canReact}
              title={`React ${emoji}`}
            >
              {emoji} {who.length}
            </button>
          ))}
          {canReact && (
            <span className="reaction-add-wrap">
              <button
                type="button"
                className="reaction-add"
                aria-expanded={picker}
                aria-label={`React to ${name}'s pick`}
                onClick={() => setPicker((v) => !v)}
              >
                ＋
              </button>
              {picker && (
                <span className="reaction-picker">
                  {WC_REACTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="reaction-option"
                      onClick={() => {
                        void reactPick(match.id, pick.predictorId, e);
                        setPicker(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
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
