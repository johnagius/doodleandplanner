import {
  computeDivisions,
  computeMeister,
  findCompetition,
  findFixture,
  type ClubLeaderRow,
  type ClubLeagueState,
  type ClubResult,
  type DivisionMovement,
  type MeisterContender,
  type PeriodDivisions,
} from '@dap/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { TeamChip } from './TeamChip.js';
import { ShieldIcon, TrophyIcon } from './TrophyIcons.js';
import { liveScoresFromStore } from './liveScores.js';

/** Periods, divisions, promotion/relegation and the Champions Run-In finale. */
export function DivisionsView({ club }: { club: ClubLeagueState }) {
  const divisions = useMemo(() => computeDivisions(club), [club]);
  // Land on the latest period that has started, else the first.
  const initial = useMemo(() => {
    const started = divisions.filter((d) => d.started);
    return (started[started.length - 1] ?? divisions[0])?.period.id ?? '';
  }, [divisions]);
  const [periodId, setPeriodId] = useState(initial);
  const current = divisions.find((d) => d.period.id === periodId) ?? divisions[0];

  if (!current) {
    return (
      <EmptyState icon="🗂️" title="No periods set up" hint="Add periods to split the season." />
    );
  }

  return (
    <div className="stack">
      <div className="club-period-tabs" role="tablist" aria-label="Season periods">
        {divisions.map((d) => (
          <button
            key={d.period.id}
            role="tab"
            aria-selected={d.period.id === current.period.id}
            className={`club-period-tab ${d.period.id === current.period.id ? 'active' : ''} ${
              d.started ? '' : 'is-future'
            }`}
            onClick={() => setPeriodId(d.period.id)}
          >
            {d.period.runIn ? '🏁 ' : ''}
            {d.period.name}
          </button>
        ))}
      </div>

      <PeriodPanel panel={current} club={club} />
    </div>
  );
}

function PeriodPanel({ panel, club }: { panel: PeriodDivisions; club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const moveOf = new Map(panel.movement.map((m) => [m.predictorId, m]));

  if (!panel.started) {
    return (
      <EmptyState
        icon="⏳"
        title={`${panel.period.name} hasn’t started`}
        hint={
          panel.period.runIn
            ? 'The closing run-in fires up once its first fixture is played — the top contenders reset to level.'
            : 'Standings appear here as soon as this period’s first result lands.'
        }
      />
    );
  }

  if (panel.runIn) {
    return (
      <div className="stack">
        <div className="banner club-runin-banner">
          🏁 <strong>The finale.</strong> Contenders <strong>reset to level</strong> and fight it
          out over this period’s fixtures — the leaders for the {panel.runIn.trophy.name}, the top
          of League 2 for {panel.runInSecond?.trophy.name ?? 'their own trophy'}.
        </div>
        <DivisionTable
          title={panel.runIn.trophy.name}
          icon={<TrophyIcon size={22} />}
          rows={panel.runIn.contenders}
          meId={meId}
          moveOf={moveOf}
          highlightTop
        />
        {panel.runInSecond && (
          <DivisionTable
            title={panel.runInSecond.trophy.name}
            icon={<ShieldIcon size={22} />}
            rows={panel.runInSecond.contenders}
            meId={meId}
            moveOf={moveOf}
            highlightTop
          />
        )}
        {panel.runInOthers && panel.runInOthers.length > 0 && (
          <DivisionTable
            title="Also playing"
            rows={panel.runInOthers}
            meId={meId}
            moveOf={moveOf}
          />
        )}
        <MeisterPanel club={club} meId={meId} />
      </div>
    );
  }

  if (panel.combined) {
    return (
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Opening period — one combined table. Its finish seeds the first split into League 1 &
          League 2.
        </p>
        <DivisionTable title="Opening table" rows={panel.combined} meId={meId} moveOf={moveOf} />
      </div>
    );
  }

  return (
    <div className="stack">
      <DivisionTable
        title="🥇 League 1"
        rows={panel.league1}
        meId={meId}
        moveOf={moveOf}
        markRelegationLast
      />
      <DivisionTable
        title="League 2"
        rows={panel.league2}
        meId={meId}
        moveOf={moveOf}
        markPromotionFirst
      />
      <p className="muted small" style={{ margin: 0 }}>
        🔁 Promotion &amp; relegation apply <strong>only when this period ends</strong> (
        {periodEnd(panel.period.endsAt)}) — the bottom of League 1 swaps with the top of League 2.
        Nothing changes mid-period.
      </p>
    </div>
  );
}

/** "31 October 2026" — a period's closing date, when promotion/relegation bites. */
function periodEnd(endsAtIso: string): string {
  return new Date(new Date(endsAtIso).getTime() - 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The Meister Cup — the grand finale between the Master League Trophy winner and
 * the First Division Shield winner, decided on their Champions League final bet. */
function MeisterPanel({ club, meId }: { club: ClubLeagueState; meId: string | null }) {
  const live = useClubLeagueStore((s) => s.live);
  const liveScores: Record<string, ClubResult> = liveScoresFromStore(club, live);
  const cup = useMemo(
    () => computeMeister(club, Object.keys(liveScores).length ? { liveScores } : undefined),
    [club, liveScores],
  );
  if (cup.contenders.length === 0) return null;

  const final = cup.finalFixtureId ? findFixture(club, cup.finalFixtureId) : undefined;
  const comp = final ? findCompetition(club, final.competitionId) : undefined;
  const score = final ? (final.result ?? liveScores[final.id]) : undefined;
  const winner = cup.winnerId ? cup.contenders.find((c) => c.predictorId === cup.winnerId) : null;
  const tiebreakNote =
    cup.tiebreak === 'lastWeek'
      ? 'level on the final — decided on the highest points in the closing week'
      : cup.tiebreak === 'seniority'
        ? 'level on the final and the closing week — the Master League seat prevails'
        : null;

  return (
    <div className="card stack club-meister">
      <h3 className="club-meister-title">
        <TrophyIcon size={24} />
        Meister Cup
      </h3>
      <p className="muted small" style={{ margin: 0 }}>
        The grand finale: the <strong>Master League Trophy</strong> winner faces the{' '}
        <strong>First Division Shield</strong> winner, decided purely by their bet on the{' '}
        <strong>Champions League final</strong>. Only these two may predict it.
      </p>

      <div className="club-meister-vs">
        {cup.contenders.map((c) => (
          <MeisterSeat
            key={c.predictorId}
            c={c}
            isMe={c.predictorId === meId}
            decided={cup.decided}
          />
        ))}
      </div>

      {final ? (
        <div className="club-meister-final">
          <div className="club-meister-final-head">
            {comp?.emoji ?? '🏆'} Champions League final
            {score && (
              <strong className="club-meister-score">
                {' '}
                {score.home}–{score.away}
              </strong>
            )}
          </div>
          <div className="club-meister-final-teams">
            <TeamChip side={final.home} />
            <span className="muted">v</span>
            <TeamChip side={final.away} align="right" />
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Awaiting the Champions League final — it appears here once the draw reaches it.
        </p>
      )}

      {winner ? (
        <div className="banner club-meister-winner">
          🥇 <strong>{winner.name}</strong> lifts the Meister Cup
          {tiebreakNote ? ` — ${tiebreakNote}.` : '.'}
        </div>
      ) : (
        cup.contenders.length === 2 && (
          <p className="muted small" style={{ margin: 0 }}>
            Winner decided when the final is played. If they score level, the highest points in the
            closing week takes it.
          </p>
        )
      )}
    </div>
  );
}

function MeisterSeat({
  c,
  isMe,
  decided,
}: {
  c: MeisterContender;
  isMe: boolean;
  decided: boolean;
}) {
  const pick = c.prediction;
  const label = pick?.outcome
    ? pick.outcome === '1'
      ? 'Home'
      : pick.outcome === '2'
        ? 'Away'
        : 'Draw'
    : null;
  return (
    <div className={`club-meister-seat ${isMe ? 'is-me' : ''}`}>
      <span className={`club-meister-seat-tag ${c.side}`}>
        {c.side === 'master' ? 'Master League' : 'First Division'}
      </span>
      <span className="club-meister-seat-name">{c.name}</span>
      <span className="muted small">
        {pick
          ? `Final bet: ${[label, pick.totals ? (pick.totals === 'over' ? 'Over 2.5' : 'Under 2.5') : null, pick.btts ? (pick.btts === 'yes' ? 'BTTS' : 'No BTTS') : null].filter(Boolean).join(' · ')}`
          : 'No bet on the final yet'}
      </span>
      {decided && <span className="club-meister-seat-pts">{c.points} pts</span>}
    </div>
  );
}

function MovementTag({ change }: { change: DivisionMovement['change'] }) {
  if (change === 'promoted')
    return (
      <span className="club-move up" title="Promoted">
        ▲
      </span>
    );
  if (change === 'relegated')
    return (
      <span className="club-move down" title="Relegated">
        ▼
      </span>
    );
  return null;
}

function DivisionTable({
  title,
  icon,
  rows,
  meId,
  moveOf,
  markRelegationLast,
  markPromotionFirst,
  highlightTop,
}: {
  title: string;
  icon?: ReactNode;
  rows: ClubLeaderRow[];
  meId: string | null;
  moveOf: Map<string, DivisionMovement>;
  markRelegationLast?: boolean;
  markPromotionFirst?: boolean;
  highlightTop?: boolean;
}) {
  return (
    <div className="card stack club-division">
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        {icon}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          No players in this division yet.
        </p>
      ) : (
        <ol className="club-division-list">
          {rows.map((r, i) => {
            const isReleg = markRelegationLast && i === rows.length - 1;
            const isPromo = markPromotionFirst && i === 0;
            return (
              <li
                key={r.predictorId}
                className={`${r.predictorId === meId ? 'is-me' : ''} ${
                  isReleg ? 'is-releg' : ''
                } ${isPromo ? 'is-promo' : ''} ${highlightTop && i === 0 ? 'is-leader' : ''}`}
              >
                <span className="club-division-rank">{i + 1}</span>
                <span className="club-division-name">
                  {r.name}
                  <MovementTag change={moveOf.get(r.predictorId)?.change ?? 'same'} />
                  {isPromo && <span className="club-zone up">↑ promotion spot</span>}
                  {isReleg && <span className="club-zone down">↓ relegation spot</span>}
                </span>
                <span className="club-division-pts">{r.points}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
