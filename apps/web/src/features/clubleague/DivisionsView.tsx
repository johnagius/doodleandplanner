import {
  computeDivisions,
  type ClubLeaderRow,
  type ClubLeagueState,
  type DivisionMovement,
  type PeriodDivisions,
} from '@dap/shared';
import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';

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

      <PeriodPanel panel={current} />
    </div>
  );
}

function PeriodPanel({ panel }: { panel: PeriodDivisions }) {
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
          title={`${panel.runIn.trophy.emoji} ${panel.runIn.trophy.runInName} — ${panel.runIn.trophy.name}`}
          rows={panel.runIn.contenders}
          meId={meId}
          moveOf={moveOf}
          highlightTop
        />
        {panel.runInSecond && (
          <DivisionTable
            title={`${panel.runInSecond.trophy.emoji} ${panel.runInSecond.trophy.runInName} — ${panel.runInSecond.trophy.name}`}
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
  rows,
  meId,
  moveOf,
  markRelegationLast,
  markPromotionFirst,
  highlightTop,
}: {
  title: string;
  rows: ClubLeaderRow[];
  meId: string | null;
  moveOf: Map<string, DivisionMovement>;
  markRelegationLast?: boolean;
  markPromotionFirst?: boolean;
  highlightTop?: boolean;
}) {
  return (
    <div className="card stack club-division">
      <h3 style={{ margin: 0 }}>{title}</h3>
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
