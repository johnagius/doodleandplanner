/**
 * Living play-by-play for the Match Room cinema — synthesised from the live feed
 * (no real commentary source exists). Combines goals/cards, the running score,
 * our sweepstake table-flips, and kick-off / half-time / full-time beats into a
 * ticker with a bit of personality. Pure + deterministic (flavour seeded by the
 * minute) so it's testable; reads only frozen data, scoring untouched.
 */
import {
  findTeam,
  liveRankFlips,
  minuteValue,
  type WcMatch,
  type WcMatchEvent,
  type WorldCupState,
} from '@dap/shared';
import type { WcLiveInfo } from '../../state/worldCupStore.js';

export interface CommentaryLine {
  id: string;
  minute: string;
  sort: number;
  icon: string;
  tone: 'goal' | 'card' | 'flip' | 'status';
  text: string;
}

const GOAL_FLAVOUR = [
  'What a finish!',
  'The net ripples!',
  'Get in there!',
  'Cool as you like!',
  'The bench is up!',
  'Bedlam in the stands!',
];

function pick(seed: number): string {
  return GOAL_FLAVOUR[Math.abs(Math.round(seed)) % GOAL_FLAVOUR.length]!;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function sideOf(match: WcMatch, tla: string): 'home' | 'away' | null {
  if (tla === match.homeId) return 'home';
  if (tla === match.awayId) return 'away';
  return null;
}

export function buildCommentary(
  wc: WorldCupState,
  match: WcMatch,
  live: WcLiveInfo | undefined,
  events: WcMatchEvent[] | undefined,
): CommentaryLine[] {
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const nameOf = (tla: string) => findTeam(wc, tla)?.name ?? tla;
  const lines: CommentaryLine[] = [];

  // Has the match actually started? Before kickoff there's no play to narrate —
  // the build-up owns the screen, so don't fake a "we're under way" line.
  const started =
    !!match.result ||
    (events?.length ?? 0) > 0 ||
    live?.status === 'IN_PLAY' ||
    live?.status === 'PAUSED' ||
    (live?.minute ?? 0) > 0 ||
    (live?.home ?? 0) > 0 ||
    (live?.away ?? 0) > 0;

  if (!started) return lines;

  lines.push({
    id: 'ko',
    minute: "0'",
    sort: -1,
    icon: '🟢',
    tone: 'status',
    text: `Kick-off — ${home?.name ?? 'Home'} v ${away?.name ?? 'Away'}. We're under way!`,
  });

  let h = 0;
  let a = 0;
  const sorted = [...(events ?? [])].sort((x, y) => minuteValue(x.minute) - minuteValue(y.minute));
  sorted.forEach((e, i) => {
    const m = minuteValue(e.minute);
    const side = sideOf(match, e.teamTla);
    if (e.kind === 'goal' || e.kind === 'pen-goal') {
      if (side === 'home') h++;
      else if (side === 'away') a++;
      const pen = e.kind === 'pen-goal' ? ' from the spot' : '';
      lines.push({
        id: `g${i}`,
        minute: e.minute,
        sort: m,
        icon: '⚽',
        tone: 'goal',
        text: `GOAL! ${e.player}${pen} for ${nameOf(e.teamTla)} — ${h}–${a}. ${pick(m)}`,
      });
    } else if (e.kind === 'own-goal') {
      if (side === 'home') a++;
      else if (side === 'away') h++;
      lines.push({
        id: `g${i}`,
        minute: e.minute,
        sort: m,
        icon: '⚽',
        tone: 'goal',
        text: `Own goal! ${e.player} turns it into his own net — ${h}–${a}.`,
      });
    } else if (e.kind === 'yellow') {
      lines.push({
        id: `c${i}`,
        minute: e.minute,
        sort: m + 0.1,
        icon: '🟨',
        tone: 'card',
        text: `Booking — ${e.player} (${nameOf(e.teamTla)}) goes into the book.`,
      });
    } else if (e.kind === 'red') {
      lines.push({
        id: `c${i}`,
        minute: e.minute,
        sort: m + 0.1,
        icon: '🟥',
        tone: 'card',
        text: `Red card! ${e.player} (${nameOf(e.teamTla)}) is off — down to ten!`,
      });
    }
  });

  // Sweepstake table-flips — our drama layer.
  liveRankFlips(wc, match.id, events).forEach((f, i) => {
    lines.push({
      id: `f${i}`,
      minute: f.minute,
      sort: minuteValue(f.minute) + 0.05,
      icon: f.topChange ? '👑' : '🔀',
      tone: 'flip',
      text: f.topChange
        ? `${f.name} tops the table on this scoreline!`
        : `${f.name} climbs to ${ordinal(f.toRank)}${
            f.passed.length ? ` — past ${f.passed.slice(0, 2).join(', ')}` : ''
          }.`,
    });
  });

  if (match.result) {
    lines.push({
      id: 'ft',
      minute: 'FT',
      sort: 9999,
      icon: '🏁',
      tone: 'status',
      text: `Full time — ${home?.name ?? 'Home'} ${match.result.home}–${match.result.away} ${
        away?.name ?? 'Away'
      }.`,
    });
  } else if (live?.status === 'PAUSED') {
    lines.push({
      id: 'ht',
      minute: 'HT',
      sort: 45.9,
      icon: '⏸',
      tone: 'status',
      text: `Half-time — ${h}–${a}. Grab a drink.`,
    });
  }

  // Most recent first — a live ticker.
  return lines.sort((x, y) => y.sort - x.sort);
}
