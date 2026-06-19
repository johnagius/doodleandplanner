/**
 * Banter helpers for the per-match comment thread. The thread was a dead, hidden
 * text box; these make it one-tap and inviting: canned lines tuned to the match
 * phase, a short preview for the collapsed bar, and a warm empty-state prompt.
 */
export type WcMatchPhase = 'pre' | 'live' | 'ft';

const CHIPS: Record<WcMatchPhase, readonly string[]> = {
  pre: ['Bold pick 😏', 'Easy 2-0', 'Group of death 💀', 'Dark horses 🐎', '🐐'],
  live: ['GOOOAL ⚽', 'VAR?! 🤬', 'Park the bus 🚌', 'Off! 🟥', 'What a save 🧤'],
  ft: ['Called it 😎', 'Robbery 😤', 'Bottlers 🍾', 'Get in! 🎉', 'Gutted 💔'],
};

/** One-tap banter lines for a match's phase, so posting needs no typing. */
export function banterChips(phase: WcMatchPhase): readonly string[] {
  return CHIPS[phase];
}

/** A short, single-line preview of a comment for the collapsed bar. */
export function commentSnippet(text: string, max = 42): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MentionSegment {
  text: string;
  mention: boolean;
}

/**
 * Split `text` into runs, flagging "@Name" mentions of any known predictor name
 * (case-insensitive, longest names first so "@Jo" can't shadow "@John"). Pure,
 * so it's used both to render highlights and to detect pings.
 */
export function mentionSegments(text: string, names: string[]): MentionSegment[] {
  const valid = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (valid.length === 0) return [{ text, mention: false }];
  const re = new RegExp(`@(${valid.map(escapeRegex).join('|')})\\b`, 'gi');
  const out: MentionSegment[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out.length > 0 ? out : [{ text, mention: false }];
}

/** Whether `text` @-mentions `name`. */
export function mentions(text: string, name: string): boolean {
  return mentionSegments(text, [name]).some((s) => s.mention);
}

/** An inviting, phase-aware prompt shown when a thread is empty. */
export function emptyPrompt(phase: WcMatchPhase): string {
  switch (phase) {
    case 'live':
      return 'React to the action…';
    case 'ft':
      return 'Who called it?';
    default:
      return 'Talk some trash before kickoff…';
  }
}
