/**
 * Ephemeral "is typing…" pings for a match's banter thread. Like the live
 * reactions, these ride the shared presence channel (relayed by the Worker,
 * cross-tab offline) and are never persisted — purely a sign that someone's
 * about to weigh in, to make the thread feel alive.
 */
export interface WcTyping {
  kind: 'wc-typing';
  matchId: string;
  name: string;
  at: number;
}

/** Build a typing-ping presence payload. */
export function typingPing(matchId: string, name: string, at: number = Date.now()): WcTyping {
  return { kind: 'wc-typing', matchId, name, at };
}

/** Type guard for an incoming presence payload (other features share the channel). */
export function isTyping(value: unknown): value is WcTyping {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    t.kind === 'wc-typing' &&
    typeof t.matchId === 'string' &&
    typeof t.name === 'string' &&
    typeof t.at === 'number'
  );
}

/** "Ada is typing…" / "Ada & Bo are typing…" / "3 people are typing…". */
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} & ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
