import {
  CLUB_COMBINATOR_POINTS,
  CLUB_COMBINATORS_PER_WEEK,
  clFinalFixture,
  clubCombinatorsLeft,
  findCompetition,
  findPrediction,
  isFixtureLocked,
  marketsForResult,
  meisterContenderIds,
  scoreClubPrediction,
  type ClubBtts,
  type ClubCompetition,
  type ClubFixture,
  type ClubLeagueState,
  type ClubMatchEvent,
  type ClubOutcome,
  type ClubPrediction,
  type ClubResult,
  type ClubTotals,
} from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { formatKickoff } from './clubFormat.js';
import { TeamChip } from './TeamChip.js';

/** One fixture: the markets to predict, the reveal after kick-off, the result and
 * everyone's points. Live games show the in-play score, scorers/cards, swing
 * notes and an "as it stands" reveal. Organisers get a result-override only. */
export function FixtureCard({ club, fixture }: { club: ClubLeagueState; fixture: ClubFixture }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const admin = useClubLeagueStore((s) => s.admin);
  const liveInfo = useClubLeagueStore((s) => s.live[fixture.id]);
  const notes = useClubLeagueStore((s) => s.liveNotes[fixture.id]);
  const now = new Date();
  const locked = isFixtureLocked(fixture, now);
  const isLive = !fixture.result && !!liveInfo;
  const comp = findCompetition(club, fixture.competitionId);
  const mine = meId ? findPrediction(club, fixture.id, meId) : undefined;

  // The Champions League final is the Meister Cup decider — only the Master League
  // Trophy winner and First Division Shield winner may bet it.
  const isClFinal = clFinalFixture(club)?.id === fixture.id;
  const meister = isClFinal ? meisterContenderIds(club) : null;
  const canBetFinal = !isClFinal || meId === meister?.masterId || meId === meister?.firstDivId;

  // "As it stands" score for a live game; the real result once final.
  const liveScore: ClubResult | null = isLive ? { home: liveInfo.home, away: liveInfo.away } : null;
  const effective = fixture.result ?? liveScore;
  const settled = effective ? marketsForResult(effective) : null;

  return (
    <div className={`card club-fixture ${isLive ? 'is-live' : ''}`} id={`club-fx-${fixture.id}`}>
      <div className="club-fixture-head">
        <CompChip comp={comp} />
        <span className="muted small">
          {formatKickoff(fixture.kickoff)} 🇲🇹{fixture.note ? ` · ${fixture.note}` : ''}
        </span>
        {fixture.result ? (
          <span className="club-result-badge">
            {fixture.result.home}–{fixture.result.away} FT
          </span>
        ) : isLive ? (
          <span className="badge club-live-badge">
            🔴 {liveInfo.home}–{liveInfo.away}
            {liveInfo.detail ? ` · ${liveInfo.detail}` : ''}
          </span>
        ) : locked ? (
          <span className="badge">🔒 Locked</span>
        ) : (
          <span className="badge badge-success">Open</span>
        )}
        {isClFinal && <span className="badge club-meister-badge">🥇 Meister Cup decider</span>}
        {/* Own combinator flag before lock; after lock everyone sees it in the reveal. */}
        {mine?.combinator && !locked && (
          <span className="badge club-combi-badge">🎯 Combinator</span>
        )}
      </div>

      <div className="club-fixture-teams">
        <TeamChip side={fixture.home} />
        <span className="club-vs">
          {fixture.result
            ? `${fixture.result.home} – ${fixture.result.away}`
            : isLive
              ? `${liveInfo.home} – ${liveInfo.away}`
              : 'v'}
        </span>
        <TeamChip side={fixture.away} align="right" />
      </div>

      {isLive && liveInfo.events && liveInfo.events.length > 0 && (
        <EventsList events={liveInfo.events} home={fixture.home.short} away={fixture.away.short} />
      )}

      {!locked && meId && canBetFinal && <MarketPicker club={club} fixture={fixture} />}

      {!locked && meId && !canBetFinal && (
        <p className="muted small club-meister-lock" style={{ margin: '0.25rem 0 0' }}>
          🥇 Only the <strong>Meister Cup</strong> finalists — the Master League Trophy &amp; First
          Division Shield winners — may predict the Champions League final.
        </p>
      )}

      {!locked && !meId && (
        <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
          Pick who you are at the top to start predicting.
        </p>
      )}

      {locked && (
        <RevealTable club={club} fixture={fixture} settled={settled} liveScore={liveScore} />
      )}

      {mine && <MyTicket club={club} fixture={fixture} liveScore={liveScore} />}

      {isLive && notes && notes.length > 0 && (
        <ul className="club-live-notes">
          {[...notes].reverse().map((n, i) => (
            <li key={i}>📣 {n}</li>
          ))}
        </ul>
      )}

      {admin && <ResultEditor fixture={fixture} />}
    </div>
  );
}

/** Goals + cards for a live game, split by side. */
function EventsList({
  events,
  home,
  away,
}: {
  events: ClubMatchEvent[];
  home: string;
  away: string;
}) {
  const icon = (k: ClubMatchEvent['kind']) =>
    k === 'yellow'
      ? '🟨'
      : k === 'red'
        ? '🟥'
        : k === 'own-goal'
          ? '⚽(og)'
          : k === 'penalty'
            ? '⚽(p)'
            : '⚽';
  const line = (side: 'home' | 'away') =>
    events
      .filter((e) => e.team === side)
      .map((e, i) => (
        <span key={i} className="club-ev">
          {icon(e.kind)} {e.player ?? ''}
          {e.clock ? ` ${e.clock}` : ''}
        </span>
      ));
  return (
    <div className="club-events">
      <div className="club-events-side">
        <span className="muted small">{home}</span> {line('home')}
      </div>
      <div className="club-events-side club-events-away">
        {line('away')} <span className="muted small">{away}</span>
      </div>
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
      <CombinatorToggle club={club} fixture={fixture} meId={meId} mine={mine} />
    </div>
  );
}

/** The combinator (accumulator) switch: all three markets right → double points,
 * anything wrong → 0. Capped at {@link CLUB_COMBINATORS_PER_WEEK} per week. */
function CombinatorToggle({
  club,
  fixture,
  meId,
  mine,
}: {
  club: ClubLeagueState;
  fixture: ClubFixture;
  meId: string;
  mine: ClubPrediction | undefined;
}) {
  const predictMarket = useClubLeagueStore((s) => s.predictMarket);
  const error = useClubLeagueStore((s) => s.error);
  const on = !!mine?.combinator;
  const allThree = !!mine?.outcome && !!mine?.totals && !!mine?.btts;
  const left = clubCombinatorsLeft(club, meId, fixture.kickoff);
  // Can turn on only with all three markets picked and a combinator to spare.
  const canTurnOn = allThree && (on || left > 0);

  return (
    <div className="club-combi">
      <button
        type="button"
        className={`club-combi-btn ${on ? 'is-on' : ''}`}
        aria-pressed={on}
        disabled={!on && !canTurnOn}
        onClick={() => void predictMarket(fixture.id, { combinator: !on })}
        title={
          allThree
            ? `All three right = +${CLUB_COMBINATOR_POINTS}, any wrong = 0`
            : 'Pick all three markets first'
        }
      >
        🎯 {on ? `Combinator ON · +${CLUB_COMBINATOR_POINTS} or 0` : 'Combinator'}
      </button>
      <span className="muted small">
        {on
          ? 'All three must be right for double points — otherwise 0.'
          : !allThree
            ? 'Fill all three markets to enable.'
            : `${left} of ${CLUB_COMBINATORS_PER_WEEK} left this week.`}
      </span>
      {on && error && error.includes('combinator') && (
        <span className="club-combi-err small">{error}</span>
      )}
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

/** Your own ticket summary (with live/final points). */
function MyTicket({
  club,
  fixture,
  liveScore,
}: {
  club: ClubLeagueState;
  fixture: ClubFixture;
  liveScore: ClubResult | null;
}) {
  const meId = useClubLeagueStore((s) => s.meId)!;
  const clearMyPrediction = useClubLeagueStore((s) => s.clearMyPrediction);
  const locked = isFixtureLocked(fixture, new Date());
  const mine = findPrediction(club, fixture.id, meId);
  if (!mine) return null;
  const effective = fixture.result ?? liveScore;
  const score = effective ? scoreClubPrediction(mine, effective) : null;

  return (
    <div className="club-myticket">
      <span className="muted small">Your pick:</span>
      {mine.combinator && (
        <span className="club-combi-tag" title="Combinator — all three or nothing">
          🎯
        </span>
      )}
      <TicketPills pred={mine} settled={effective ? marketsForResult(effective) : null} />
      {score != null && (
        <span className={`club-ticket-pts ${score.points > 0 ? 'is-hit' : 'is-miss'}`}>
          +{score.points}
          {!fixture.result && liveScore ? ' *' : ''}
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

/** After lock-in, reveal everyone's picks + points (live "as it stands", or final). */
function RevealTable({
  club,
  fixture,
  settled,
  liveScore,
}: {
  club: ClubLeagueState;
  fixture: ClubFixture;
  settled: { outcome: ClubOutcome; totals: ClubTotals; btts: ClubBtts } | null;
  liveScore: ClubResult | null;
}) {
  const meId = useClubLeagueStore((s) => s.meId);
  const effective = fixture.result ?? liveScore;
  const asStands = !fixture.result && !!liveScore;
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
          {asStands ? 'As it stands' : 'Settled'}: {settled.outcome} ·{' '}
          {settled.totals === 'over' ? 'Over 2.5' : 'Under 2.5'} · BTTS{' '}
          {settled.btts === 'yes' ? 'Yes' : 'No'}
        </div>
      )}
      <ul className="club-reveal-list">
        {rows.map(({ p, pred }) => {
          const score = effective && pred ? scoreClubPrediction(pred, effective) : null;
          return (
            <li key={p.id} className={p.id === meId ? 'is-me' : ''}>
              <span className="club-reveal-name">
                {p.name}
                {pred!.combinator && (
                  <span className="club-combi-tag" title="Played a combinator">
                    🎯
                  </span>
                )}
              </span>
              <TicketPills pred={pred!} settled={settled} />
              {score != null && (
                <span className={`club-ticket-pts ${score.points > 0 ? 'is-hit' : 'is-miss'}`}>
                  +{score.points}
                  {asStands ? ' *' : ''}
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
