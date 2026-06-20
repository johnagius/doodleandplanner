/**
 * The big screen's "broadcast" — ambient lines that keep the room alive between
 * live moments: win probability, our leaderboard as it stands, the group table,
 * match info, who's still to pick, and a little flavour. Pure + deterministic
 * over frozen data (scoring untouched); the Cinema's director rotates these in,
 * one category at a time, so the screen always has something fresh to read.
 */
import {
  findTeam,
  groupStandings,
  impliedOutcome,
  predictionCount,
  type WcLeaderRowMoved,
  type WcMatch,
  type WorldCupState,
} from '@dap/shared';
import type { WcLiveInfo } from '../../state/worldCupStore.js';

export type BroadcastTone = 'stat' | 'board' | 'group' | 'info' | 'flavour';
export interface BroadcastItem {
  id: string;
  icon: string;
  tone: BroadcastTone;
  text: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function isInPlay(s: string | undefined): boolean {
  return s === 'IN_PLAY' || s === 'PAUSED';
}

const FLAVOUR: BroadcastItem[] = [
  { id: 'fl-snacks', icon: '🍿', tone: 'flavour', text: 'Snacks sorted? Settle in.' },
  { id: 'fl-chat', icon: '📱', tone: 'flavour', text: 'Drop your hot take in the chat 👇' },
  { id: 'fl-noise', icon: '📣', tone: 'flavour', text: 'Make some noise for the lads!' },
  { id: 'fl-eyes', icon: '👀', tone: 'flavour', text: 'Eyes on the big screen…' },
];

/**
 * Build the rotation pool, interleaved across categories so two consecutive
 * lines are never the same kind. The director steps through it on a timer.
 */
export function buildBroadcast(
  wc: WorldCupState,
  match: WcMatch,
  live: WcLiveInfo | undefined,
  standings: WcLeaderRowMoved[],
): BroadcastItem[] {
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const live_ = isInPlay(live?.status) && !match.result;
  const pools: Record<BroadcastTone, BroadcastItem[]> = {
    info: [],
    stat: [],
    board: [],
    group: [],
    flavour: [],
  };

  // ── Match info ───────────────────────────────────────────────────────────
  if (home && away) {
    pools.info.push({
      id: 'info-vs',
      icon: '⚽',
      tone: 'info',
      text: `${home.name} v ${away.name}${match.group ? ` · Group ${match.group}` : ''}`,
    });
  }
  if (!match.result && !live_) {
    const inCount = predictionCount(wc, match.id);
    const total = wc.predictors.length;
    if (total > 0) {
      pools.info.push({
        id: 'info-locking',
        icon: '🗳',
        tone: 'info',
        text:
          inCount >= total
            ? `All ${total} picks are in — lineups locked.`
            : `Picks locking in… ${inCount} of ${total} are in.`,
      });
    }
  }

  // ── Stats: win probability + live score ──────────────────────────────────
  const imp = impliedOutcome(wc.odds?.[match.id]);
  if (imp && home && away) {
    pools.stat.push({
      id: 'stat-odds',
      icon: '📈',
      tone: 'stat',
      text: `${home.name} ${Math.round(imp.home * 100)}% · Draw ${Math.round(
        imp.draw * 100,
      )}% · ${away.name} ${Math.round(imp.away * 100)}%`,
    });
  }
  if (live_ && live?.home != null && live.away != null) {
    pools.stat.push({
      id: 'stat-live',
      icon: '⏱',
      tone: 'stat',
      text: `As it stands: ${home?.name ?? 'Home'} ${live.home}–${live.away} ${
        away?.name ?? 'Away'
      }${live.clock ? ` (${live.clock})` : ''}`,
    });
  }

  // ── Our leaderboard ──────────────────────────────────────────────────────
  const scored = standings.filter((r) => r.points > 0);
  if (scored[0]) {
    const lead = scored[0];
    const gap = scored[1] ? lead.points - scored[1].points : 0;
    pools.board.push({
      id: 'board-lead',
      icon: '👑',
      tone: 'board',
      text:
        scored[1] && gap > 0
          ? `${lead.name} leads on ${lead.points} — ${gap} ahead of ${scored[1].name}`
          : `${lead.name} leads the predictions on ${lead.points}`,
    });
  }
  const mover = standings.find((r) => r.movement > 0);
  if (mover) {
    pools.board.push({
      id: 'board-move',
      icon: '🔼',
      tone: 'board',
      text: `${mover.name} climbs to ${ordinal(mover.rank)} in our table`,
    });
  }

  // ── Group standings ──────────────────────────────────────────────────────
  if (match.group) {
    const rows = groupStandings(wc, match.group);
    if (rows[0] && rows[0].played > 0) {
      const t0 = findTeam(wc, rows[0].teamId);
      pools.group.push({
        id: 'group-top',
        icon: '📊',
        tone: 'group',
        text: `Group ${match.group}: ${t0?.name ?? rows[0].teamId} top on ${rows[0].points}`,
      });
    }
    const hi = match.homeId ? rows.findIndex((r) => r.teamId === match.homeId) : -1;
    if (hi >= 0 && home && rows[hi]!.played > 0) {
      pools.group.push({
        id: 'group-home',
        icon: '🔢',
        tone: 'group',
        text: `${home.name} sit ${ordinal(hi + 1)} in Group ${match.group}`,
      });
    }
  }

  // ── Flavour ──────────────────────────────────────────────────────────────
  pools.flavour.push(...FLAVOUR);

  // Greedily interleave: each step take the next line from the category with the
  // most remaining that *differs* from the one just played, so consecutive lines
  // are different kinds wherever the counts allow.
  const queues: BroadcastTone[] = ['info', 'stat', 'board', 'group', 'flavour'];
  const remaining = queues.map((cat) => ({ cat, items: [...pools[cat]] }));
  const out: BroadcastItem[] = [];
  let last: BroadcastTone | null = null;
  while (remaining.some((q) => q.items.length > 0)) {
    const ready = remaining.filter((q) => q.items.length > 0);
    const pick =
      ready.filter((q) => q.cat !== last).sort((a, b) => b.items.length - a.items.length)[0] ??
      ready[0]!;
    out.push(pick.items.shift()!);
    last = pick.cat;
  }
  return out;
}
