/**
 * Lets a feature attach extra HTTP headers to room saves without the generic
 * repository knowing about it. The World Cup board uses this to send the current
 * name's signed session token (X-WC-Session) so the Worker can authorise edits.
 */
type HeaderProvider = () => Record<string, string>;

let provider: HeaderProvider | null = null;

/** Register (or clear) the provider consulted on every `saveRoom`. */
export function setSaveHeaderProvider(fn: HeaderProvider | null): void {
  provider = fn;
}

/** Extra headers for the next save; never throws. */
export function saveHeaders(): Record<string, string> {
  try {
    return provider?.() ?? {};
  } catch {
    return {};
  }
}
