import {
  findTeam,
  forwardScenarios,
  impliedOutcome,
  matchScenarios,
  unplayedBefore,
  type WcLiveSnapshot,
  type WcMatch,
  type WorldCupState,
} from '@dap/shared';
import { type WcLiveInfo } from '../../state/worldCupStore.js';

function pct(p: number): string {
  const v = p * 100;
  return `${v < 10 && v > 0 ? v.toFixed(1) : Math.round(v)}%`;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function result(r: { home: number; away: number } | null): string {
  return r ? `${r.home}–${r.away}` : '';
}

interface Line {
  icon: string;
  text: string;
  /** Probability of this scenario (live-conditioned); shown at the end. */
  prob?: number;
  me?: boolean;
}

/**
 * Scenarios tab: a bookmakers read (what the market makes the match — live) plus
 * a plain-English account of how the result could shake up the leaderboard, each
 * line ending with its odds. Everything is driven by the ESPN odds + who picked
 * what and conditions on the live score, so it all updates as the match plays.
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

  const frozenOdds = wc.odds?.[match.id] ?? null; // captured at kickoff
  const liveOdds = live?.odds ?? null; // current market (when the feed has it)
  const odds = liveOdds ?? frozenOdds;

  // ── Bookmakers read ──────────────────────────────────────────────────────
  const mkt = impliedOutcome(odds);
  const mktKickoff = impliedOutcome(frozenOdds);
  let trend: { up: boolean; from: number; to: number } | null = null;
  if (inPlay && mkt && mktKickoff && Math.abs(mkt.home - mktKickoff.home) >= 0.03) {
    trend = { up: mkt.home > mktKickoff.home, from: mktKickoff.home, to: mkt.home };
  }

  // ── Leaderboard scenarios ────────────────────────────────────────────────
  // If games are still to play *before* this one, the table can move underneath
  // it — so project forward through them (their odds + picks) rather than claim a
  // bogus "100%" three rounds early. For the next match (nothing in between), the
  // exact single-match read is honest and keeps its crisp "e.g. 2–1" examples.
  const before = unplayedBefore(wc, match.id);
  const useForward = before.length > 0 && !snap;
  const lines: Line[] = [];
  let forwardNote: string | null = null;

  if (useForward) {
    const fw = forwardScenarios(wc, match.id, { oddsByMatch: { [match.id]: odds } });
    forwardNote = `Through the ${fw.matchesBefore} game${
      fw.matchesBefore === 1 ? '' : 's'
    } before it — the table can still move underneath this one.`;
    if (fw.predictedAll === 0) {
      lines.push({ icon: '🕗', text: 'No predictions are in yet for these games.' });
    } else {
      // Everyone's odds of leading by then — not just the front two. Rank by that
      // chance, list all who have any shot (keeping "me" on the card past the cap),
      // and name the ones who simply can't get there through these games.
      const ranked = fw.outlooks
        .slice()
        .sort((a, b) => b.pTop - a.pTop || a.currentRank - b.currentRank);
      const contenders = ranked.filter((o) => o.pTop > 0);
      const noShot = ranked.filter((o) => o.pTop <= 0);
      const shown = contenders.slice(0, 10);
      const mine = meId ? contenders.find((o) => o.predictorId === meId) : undefined;
      if (mine && !shown.some((o) => o.predictorId === mine.predictorId)) shown.push(mine);
      shown.forEach((o, i) => {
        lines.push({
          icon: i === 0 ? '🥇' : '🔼',
          text: `${o.name} top by then`,
          prob: o.pTop,
          me: o.predictorId === meId,
        });
      });
      const more = contenders.length - shown.length;
      if (more > 0) {
        lines.push({ icon: '➕', text: `${more} more with a slim chance` });
      }
      if (noShot.length > 0) {
        lines.push({
          icon: '🚫',
          text:
            noShot.length <= 3
              ? `${noShot.map((o) => o.name).join(', ')} can’t reach top through these games`
              : `${noShot.length} others can’t reach top through these games`,
        });
      }
    }
  } else {
    const sc = matchScenarios(wc, match.id, odds, snap);
    if (sc.predicted === 0) {
      lines.push({
        icon: '🕗',
        text: 'No predictions are in yet — they’ll shape the scenarios here.',
      });
    } else {
      const leader = sc.outlooks.find((o) => o.currentRank === 1);
      if (leader) {
        lines.push({
          icon: '🥇',
          text: `${leader.name} stays top (on ${leader.points} pt${leader.points === 1 ? '' : 's'})`,
          prob: leader.pTop,
          me: leader.predictorId === meId,
        });
      }
      for (const o of sc.outlooks
        .filter((o) => o.currentRank !== 1 && o.pTop >= 0.02)
        .sort((a, b) => b.pTop - a.pTop)) {
        lines.push({
          icon: '🔼',
          text: `${o.name} (now ${ordinal(o.currentRank)}) takes 1st${o.bestExample ? ` — e.g. ${result(o.bestExample)}` : ''}`,
          prob: o.pTop,
          me: o.predictorId === meId,
        });
      }
      for (const o of sc.outlooks.filter(
        (o) => o.currentRank !== 1 && o.pTop < 0.02 && o.bestRank < o.currentRank,
      )) {
        lines.push({
          icon: '↗️',
          text: `${o.name} climbs to ${ordinal(o.bestRank)}${o.bestExample ? ` (e.g. ${result(o.bestExample)})` : ''}`,
          prob: o.pUp,
          me: o.predictorId === meId,
        });
      }
      if (!sc.volatile) {
        lines.push({ icon: '🔒', text: 'Whatever the score, the order won’t change this match.' });
      }
    }
  }

  return (
    <div className="stack wc-scn">
      <section className="wc-scn-sec">
        <div className="wc-scn-h">💰 What the bookies make it</div>
        {mkt ? (
          <>
            <span className="wc-scn-bar" aria-hidden>
              <span className="seg home" style={{ width: `${mkt.home * 100}%` }} />
              <span className="seg draw" style={{ width: `${mkt.draw * 100}%` }} />
              <span className="seg away" style={{ width: `${mkt.away * 100}%` }} />
            </span>
            <div className="wc-scn-odds-legend muted small">
              <span>
                {home?.flag} {home?.id} {pct(mkt.home)}
              </span>
              <span>Draw {pct(mkt.draw)}</span>
              <span>
                {away?.flag} {away?.id} {pct(mkt.away)}
              </span>
            </div>
            {(odds?.details || odds?.overUnder != null) && (
              <div className="muted small">
                {odds?.details ? `${odds.details}` : ''}
                {odds?.details && odds?.overUnder != null ? ' · ' : ''}
                {odds?.overUnder != null ? `O/U ${odds.overUnder} goals` : ''}
                {liveOdds ? ' · live' : ''}
              </div>
            )}
            {trend && (
              <div className="wc-scn-trend">
                {trend.up ? '📈' : '📉'} {home?.id} {trend.up ? 'shortening' : 'drifting'} —{' '}
                {pct(trend.from)} → {pct(trend.to)} since kickoff
              </div>
            )}
          </>
        ) : (
          <div className="muted small">Bookmakers’ odds aren’t in for this match yet.</div>
        )}
      </section>

      <section className="wc-scn-sec">
        <div className="wc-scn-h">🔮 How it could shake up the table</div>
        {forwardNote && <div className="muted small wc-scn-note">{forwardNote}</div>}
        <ul className="wc-scn-list">
          {lines.map((l, i) => (
            <li key={i} className={l.me ? 'is-me' : ''}>
              <span className="wc-scn-txt">
                <span aria-hidden>{l.icon}</span> {l.text}
              </span>
              {l.prob != null && <span className="wc-scn-chance">{pct(l.prob)}</span>}
            </li>
          ))}
        </ul>
      </section>

      <p className="muted small" style={{ margin: 0 }}>
        {snap
          ? `Live ${snap.home}–${snap.away}${live!.minute != null ? `, ${live!.minute}'` : ''} — odds + chances update as it plays.`
          : useForward
            ? 'Projected across every game between now and this one — odds where we have them, the model’s prior where we don’t.'
            : odds
              ? 'From the bookmakers’ odds + everyone’s picks.'
              : 'Estimate (odds not in yet) + everyone’s picks.'}
      </p>
    </div>
  );
}
