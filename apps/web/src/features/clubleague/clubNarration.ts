/**
 * Narration via the browser's built-in speech synthesis — the best *free* option
 * that ships on every device. We deliberately pick the highest-quality voice
 * available (modern OSes bundle neural "Natural"/"Siri"/"Google" voices that are
 * a world away from the old robotic defaults), tuned to a natural pace. Captions
 * always carry the words too, so the explainer works with the sound off.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

/** Rank voices so the most natural English one wins. */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (!/^en(-|_|$)/i.test(v.lang)) s -= 100; // strongly prefer English
  if (/en-gb/i.test(v.lang)) s += 6; // British suits the football tone
  if (/natural|neural|premium|enhanced/.test(n)) s += 40;
  if (/siri|google|microsoft/.test(n)) s += 20;
  if (/\b(aria|jenny|guy|libby|sonia|ryan|google uk|samantha|serena|daniel)\b/.test(n)) s += 14;
  if (v.localService) s += 3;
  return s;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Best available voice, memoised. Voices load async on some browsers, so callers
 * may want to re-query after the `voiceschanged` event. */
export function bestVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // not loaded yet
  if (cachedVoice !== undefined) return cachedVoice;
  cachedVoice = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
  return cachedVoice;
}

/** Warm the voice list (Chrome populates it lazily). */
export function primeVoices(onReady?: () => void): void {
  if (!speechSupported()) return;
  const ready = () => {
    cachedVoice = undefined; // recompute now that voices exist
    bestVoice();
    onReady?.();
  };
  if (window.speechSynthesis.getVoices().length > 0) ready();
  else window.speechSynthesis.addEventListener('voiceschanged', ready, { once: true });
}

/** Speak a line, cancelling anything in flight. Resolves when it finishes (or is
 * cancelled). No-op (resolves immediately) when speech isn't available. */
export function speak(text: string): Promise<void> {
  if (!speechSupported()) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'en-GB';
    u.rate = 0.98;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
