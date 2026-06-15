import {
  WC_STAKE,
  bankroll,
  bankrollLeaderboard,
  betsFor,
  colorForIndex,
  findMatch,
  findTeam,
  type WcBet,
  type WcBetOutcome,
  type WorldCupState,
} from '@dap/shared';
import { useMemo, type CSSProperties } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function accent(color: string): CSSProperties {
  return { ['--c']: color } as CSSProperties;
}

/** "€3.33" / "−€5.00" with a leading sign for profit. */
function eur(n: number, sign = false): string {
  const s = n < 0 ? '−' : sign ? '+' : '';
  return `${s}€${Math.abs(n).toFixed(2)}`;
}

function outcomeLabel(wc: WorldCupState, matchId: string, outcome: WcBetOutcome): string {
  if (outcome === 'draw') return 'Draw';
  const m = findMatch(wc, matchId);
  const t = findTeam(wc, outcome === 'home' ? m?.homeId : m?.awayId);
  return `${t?.name ?? '?'} win`;
}

/** The fake-money betting game: €5 a game, auto-staked on your predicted result
 * at the odds, with a bankroll leaderboard and your bet slip. */
export function BettingView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const colorById = useMemo(
    () => new Map(wc.predictors.map((p, i) => [p.id, colorForIndex(i)])),
    [wc.predictors],
  );
  const lb = bankrollLeaderboard(wc);
  const myBets = meId ? betsFor(wc, meId) : [];
  const myBank = meId ? bankroll(wc, meId) : null;
  const anyBets = lb.some((b) => b.won + b.lost + b.pending > 0);

  if (!anyBets) {
    return (
      <EmptyState
        icon="💶"
        title="No bets running yet"
        hint="You're handed €5 a game. The moment a match you've predicted has odds, your €5 is auto-staked on the result you backed — then it settles here when the game ends."
      />
    );
  }

  return (
    <div className="stack wc-bank">
      <div className="card stack">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>💶 Bankroll</h3>
          <span className="muted small">€{WC_STAKE} a game · auto-bet on your pick</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Every game you get €{WC_STAKE} of fake money, automatically staked on the result your
          scoreline backs at the bookies' odds. It's just for bragging rights — it doesn't touch
          your prediction points.
        </p>
        <ol className="wc-bank-board">
          {lb.map((b, i) => (
            <li
              key={b.predictorId}
              className={`wc-bank-row ${b.predictorId === meId ? 'is-me' : ''}`}
              style={accent(colorById.get(b.predictorId) ?? 'var(--primary)')}
            >
              <span className="wc-bank-rank">{MEDALS[i] ?? i + 1}</span>
              <span className="wc-bank-name">
                <span className="wc-tl-dot" aria-hidden />
                {b.name}
              </span>
              <span className="muted small wc-bank-rec">
                {b.won}W–{b.lost}L{b.pending > 0 ? ` · ${b.pending} live` : ''}
              </span>
              <span
                className={`wc-bank-profit ${b.profit > 0 ? 'up' : b.profit < 0 ? 'down' : ''}`}
              >
                {eur(b.profit, true)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <h3 style={{ margin: '0.25rem 0 0' }}>{meId ? 'Your bets' : 'Your bets'}</h3>
      {!meId ? (
        <p className="muted small">Pick your name above to start your bankroll.</p>
      ) : myBets.length === 0 ? (
        <p className="muted small">
          No bets yet — predict a match that has odds and your €{WC_STAKE} rides on it
          automatically.
        </p>
      ) : (
        <>
          {myBank && (
            <div className="wc-bank-summary">
              <Stat label="Balance" value={eur(myBank.profit, true)} tone={myBank.profit} />
              <Stat label="Won" value={`${myBank.won}`} />
              <Stat label="Lost" value={`${myBank.lost}`} />
              <Stat label="Live" value={`${myBank.pending}`} />
            </div>
          )}
          <ul className="wc-bet-list">
            {[...myBets].reverse().map((bet) => (
              <BetRow key={bet.matchId} wc={wc} bet={bet} />
            ))}
          </ul>
        </>
      )}
      <p className="muted small" style={{ textAlign: 'center' }}>
        Odds frozen at first sight, three-way moneyline via ESPN/DraftKings.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const cls = tone == null ? '' : tone > 0 ? 'up' : tone < 0 ? 'down' : '';
  return (
    <div className="wc-stat">
      <div className={`wc-stat-value ${cls}`}>{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

function BetRow({ wc, bet }: { wc: WorldCupState; bet: WcBet }) {
  const m = findMatch(wc, bet.matchId);
  const home = findTeam(wc, m?.homeId);
  const away = findTeam(wc, m?.awayId);
  return (
    <li className={`wc-bet wc-bet-${bet.status}`}>
      <span className="wc-bet-main">
        <span className="wc-bet-teams">
          {home?.flag} {home?.id ?? '?'} v {away?.id ?? '?'} {away?.flag}
          {m?.result && (
            <span className="muted small">
              {' '}
              · {m.result.home}–{m.result.away}
            </span>
          )}
        </span>
        <span className="muted small">
          €{bet.stake} on {outcomeLabel(wc, bet.matchId, bet.outcome)} @{' '}
          {bet.decimalOdds.toFixed(2)}
        </span>
      </span>
      <span className={`wc-bet-out ${bet.status}`}>
        {bet.status === 'pending'
          ? '⏳ live'
          : bet.status === 'won'
            ? eur(bet.profit, true)
            : eur(bet.profit)}
      </span>
    </li>
  );
}
