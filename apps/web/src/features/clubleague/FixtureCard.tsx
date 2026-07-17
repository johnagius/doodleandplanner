import {
  findCompetition,
  findPrediction,
  isFixtureLocked,
  marketsForResult,
  scoreClubPrediction,
  type ClubBtts,
  type ClubCompetition,
  type ClubFixture,
  type ClubLeagueState,
  type ClubOutcome,
  type ClubTotals,
} from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { formatKickoff } from './clubFormat.js';
import { TeamChip } from './TeamChip.js';

/** One fixture: the markets to predict, the reveal after kick-off, the result and
 * everyone's points. Organisers get a result-override for edge cases only. */
export function FixtureCard({ club, fixture }: { club: ClubLeagueState; fixture: ClubFixture }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const admin = useClubLeagueStore((s) => s.admin);
  const now = new Date();
  const locked = isFixtureLocked(fixture, now);
  const live = fixture.status === 'live' && !fixture.result;
  const comp = findCompetition(club, fixture.competitionId);
  const mine = meId ? findPrediction(club, fixture.id, meId) : undefined;
  const settled = fixture.result ? marketsForResult(fixture.result) : null;

  return (
    <div className="card club-fixture" id={`club-fx-${fixture.id}`}>
      <div className="club-fixture-head">
        <CompChip comp={comp} />
        <span className="muted small">
          {formatKickoff(fixture.kickoff)} 🇲🇹{fixture.note ? ` · ${fixture.note}` : ''}
        </span>
        {fixture.result ? (
          <span className="club-result-badge">
            {fixture.result.home}–{fixture.result.away} FT
          </span>
        ) : live ? (
          <span className="badge club-live-badge">🔴 Live</span>
        ) : locked ? (
          <span className="badge">🔒 Locked</span>
        ) : (
          <span className="badge badge-success">Open</span>
        )}
      </div>

      <div className="club-fixture-teams">
        <TeamChip side={fixture.home} />
        <span className="club-vs">v</span>
        <TeamChip side={fixture.away} align="right" />
      </div>

      {!locked && meId && <MarketPicker club={club} fixture={fixture} />}

      {!locked && !meId && (
        <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
          Pick who you are at the top to start predicting.
        </p>
      )}

      {locked && <RevealTable club={club} fixture={fixture} settled={settled} />}

      {mine && <MyTicket club={club} fixture={fixture} />}

      {admin && <ResultEditor fixture={fixture} />}
    </div>
  );
}

/** Competition chip with the official league logo (emoji fallback). */
function CompChip({ comp }: { comp: ClubCompetition | undefined }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="club-comp-chip">
      {comp?.logo && !broken ? (
        <img
          className="club-comp-logo"
          src={comp.logo}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden>{comp?.emoji}</span>
      )}{' '}
      {comp?.short ?? 'Match'}
    </span>
  );
}

const OUTCOMES: { key: ClubOutcome; label: string }[] = [
  { key: '1', label: '1' },
  { key: 'X', label: 'X' },
  { key: '2', label: '2' },
];

function MarketPicker({ club, fixture }: { club: ClubLeagueState; fixture: ClubFixture }) {
  const meId = useClubLeagueStore((s) => s.meId)!;
  const predictMarket = useClubLeagueStore((s) => s.predictMarket);
  const mine = findPrediction(club, fixture.id, meId);

  return (
    <div className="club-markets">
      <Market label="Result">
        {OUTCOMES.map((o) => (
          <MarketBtn
            key={o.key}
            active={mine?.outcome === o.key}
            onClick={() => void predictMarket(fixture.id, { outcome: o.key })}
          >
            {o.label}
          </MarketBtn>
        ))}
      </Market>
      <Market label="Goals (2.5)">
        <MarketBtn
          active={mine?.totals === 'over'}
          onClick={() => void predictMarket(fixture.id, { totals: 'over' })}
        >
          Over
        </MarketBtn>
        <MarketBtn
          active={mine?.totals === 'under'}
          onClick={() => void predictMarket(fixture.id, { totals: 'under' })}
        >
          Under
        </MarketBtn>
      </Market>
      <Market label="Both score">
        <MarketBtn
          active={mine?.btts === 'yes'}
          onClick={() => void predictMarket(fixture.id, { btts: 'yes' })}
        >
          Yes
        </MarketBtn>
        <MarketBtn
          active={mine?.btts === 'no'}
          onClick={() => void predictMarket(fixture.id, { btts: 'no' })}
        >
          No
        </MarketBtn>
      </Market>
    </div>
  );
}

function Market({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="club-market">
      <span className="club-market-label muted small">{label}</span>
      <div className="club-market-btns">{children}</div>
    </div>
  );
}

function MarketBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`club-mbtn ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Your own ticket summary (with live points once the result lands). */
function MyTicket({ club, fixture }: { club: ClubLeagueState; fixture: ClubFixture }) {
  const meId = useClubLeagueStore((s) => s.meId)!;
  const clearMyPrediction = useClubLeagueStore((s) => s.clearMyPrediction);
  const locked = isFixtureLocked(fixture, new Date());
  const mine = findPrediction(club, fixture.id, meId);
  if (!mine) return null;
  const score = fixture.result ? scoreClubPrediction(mine, fixture.result) : null;

  return (
    <div className="club-myticket">
      <span className="muted small">Your pick:</span>
      <TicketPills pred={mine} settled={fixture.result ? marketsForResult(fixture.result) : null} />
      {score != null && (
        <span className={`club-ticket-pts ${score.points > 0 ? 'is-hit' : 'is-miss'}`}>
          +{score.points}
        </span>
      )}
      {!locked && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => void clearMyPrediction(fixture.id)}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function TicketPills({
  pred,
  settled,
}: {
  pred: { outcome?: ClubOutcome; totals?: ClubTotals; btts?: ClubBtts };
  settled: { outcome: ClubOutcome; totals: ClubTotals; btts: ClubBtts } | null;
}) {
  const cls = (hit: boolean | null) => (settled == null ? '' : hit ? 'is-hit' : 'is-miss');
  return (
    <span className="club-pills">
      {pred.outcome && (
        <span className={`club-pill ${cls(settled ? settled.outcome === pred.outcome : null)}`}>
          {pred.outcome}
        </span>
      )}
      {pred.totals && (
        <span className={`club-pill ${cls(settled ? settled.totals === pred.totals : null)}`}>
          {pred.totals === 'over' ? 'O2.5' : 'U2.5'}
        </span>
      )}
      {pred.btts && (
        <span className={`club-pill ${cls(settled ? settled.btts === pred.btts : null)}`}>
          BTTS {pred.btts === 'yes' ? 'Y' : 'N'}
        </span>
      )}
    </span>
  );
}

/** After lock-in, reveal everyone's picks + points. */
function RevealTable({
  club,
  fixture,
  settled,
}: {
  club: ClubLeagueState;
  fixture: ClubFixture;
  settled: { outcome: ClubOutcome; totals: ClubTotals; btts: ClubBtts } | null;
}) {
  const meId = useClubLeagueStore((s) => s.meId);
  const rows = club.predictors
    .map((p) => ({ p, pred: findPrediction(club, fixture.id, p.id) }))
    .filter((r) => r.pred);
  if (rows.length === 0) {
    return (
      <p className="muted small" style={{ margin: '0.4rem 0 0' }}>
        No one predicted this one.
      </p>
    );
  }
  return (
    <div className="club-reveal">
      {settled && (
        <div className="club-reveal-key muted small">
          Settled: {settled.outcome} · {settled.totals === 'over' ? 'Over 2.5' : 'Under 2.5'} · BTTS{' '}
          {settled.btts === 'yes' ? 'Yes' : 'No'}
        </div>
      )}
      <ul className="club-reveal-list">
        {rows.map(({ p, pred }) => {
          const score = fixture.result && pred ? scoreClubPrediction(pred, fixture.result) : null;
          return (
            <li key={p.id} className={p.id === meId ? 'is-me' : ''}>
              <span className="club-reveal-name">{p.name}</span>
              <TicketPills pred={pred!} settled={settled} />
              {score != null && (
                <span className={`club-ticket-pts ${score.points > 0 ? 'is-hit' : 'is-miss'}`}>
                  +{score.points}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Organiser controls — a rarely-needed safety net. Results auto-fill from the
 * feed; this is for the odd correction (e.g. a cup tie that went to extra time,
 * where the 90-minute markets should settle on the regulation score) and clean-up.
 */
function ResultEditor({ fixture }: { fixture: ClubFixture }) {
  const enterResult = useClubLeagueStore((s) => s.enterResult);
  const clearResult = useClubLeagueStore((s) => s.clearResult);
  const deleteFixture = useClubLeagueStore((s) => s.deleteFixture);
  const [home, setHome] = useState(fixture.result ? String(fixture.result.home) : '');
  const [away, setAway] = useState(fixture.result ? String(fixture.result.away) : '');

  const submit = () => {
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return;
    void enterResult(fixture.id, h, a);
  };

  return (
    <div className="club-admin-row">
      <span
        className="club-admin-tag"
        title="Results auto-fill from the feed — override only if needed"
      >
        🔧 Correct result
      </span>
      <input
        className="input club-score-input"
        inputMode="numeric"
        aria-label="Home goals"
        value={home}
        onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <span>–</span>
      <input
        className="input club-score-input"
        inputMode="numeric"
        aria-label="Away goals"
        value={away}
        onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
        {fixture.result ? 'Update' : 'Set'}
      </button>
      {fixture.result && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => void clearResult(fixture.id)}
        >
          Clear
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        title="Remove this fixture"
        onClick={() => {
          if (window.confirm('Remove this fixture and its predictions?')) {
            void deleteFixture(fixture.id);
          }
        }}
      >
        🗑
      </button>
    </div>
  );
}
