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
