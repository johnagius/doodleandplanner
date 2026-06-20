/**
 * Opt-in sound & haptics for the immersive Match Room — default OFF, persisted.
 *
 * Sounds are *synthesised* with the Web Audio API (short stings, no binary
 * assets, nothing to 404). The AudioContext is created/resumed ONLY inside the
 * user's enabling gesture, so we never trip the browser autoplay policy. Haptics
 * ride the same opt-in and are feature-detected. None of this touches scoring —
 * it's pure presentation.
 */
import { useCallback, useEffect, useState } from 'react';

const SOUND_KEY = 'dap:wc:sound';

export type WcSoundKind = 'goal' | 'exact' | 'rankup' | 'whistle' | 'anthem';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}
function writeEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(SOUND_KEY, '1');
    else localStorage.removeItem(SOUND_KEY);
  } catch {
    /* private mode / SSR — ignore */
  }
}

// Module singletons: the setting and the lazily-unlocked audio context.
let enabled = readEnabled();
let ctx: AudioContext | null = null;

type AudioCtor = new () => AudioContext;
function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Create (or resume) the AudioContext. MUST be called from within a user
 * gesture — that's the whole point of gating audio behind the toggle.
 */
function unlock(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
}

// Cross-instance subscription so every toggle/indicator stays in sync.
const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * Turn sound & haptics on/off. Enabling unlocks audio within the caller's
 * gesture and is persisted. Returns the new state.
 */
export function setSoundEnabled(on: boolean): boolean {
  enabled = on;
  writeEnabled(on);
  if (on) unlock();
  notify();
  return enabled;
}

/** React binding for the toggle button. */
export function useSoundSetting(): {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (on: boolean) => void;
} {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    const l = () => setOn(enabled);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const toggle = useCallback(() => setSoundEnabled(!enabled), []);
  return { enabled: on, toggle, setEnabled: setSoundEnabled };
}

// --- synthesis -----------------------------------------------------------

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
}

function tone(o: ToneOpts): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.dur);
  const peak = o.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

/** A short decaying noise burst — the body of the "crowd roar". */
function noiseBurst(dur: number, gain = 0.16): void {
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(ctx.destination);
  src.start(ctx.currentTime);
}

const PATTERNS: Record<WcSoundKind, () => void> = {
  // Crowd roar + a rising major triad.
  goal: () => {
    noiseBurst(0.55, 0.18);
    tone({ freq: 523, dur: 0.5, type: 'sawtooth', gain: 0.1 });
    tone({ freq: 659, dur: 0.5, type: 'sawtooth', gain: 0.1, delay: 0.08 });
    tone({ freq: 784, dur: 0.6, type: 'sawtooth', gain: 0.1, delay: 0.16 });
  },
  // Bright two-note "spot on" chime.
  exact: () => {
    tone({ freq: 880, dur: 0.16 });
    tone({ freq: 1318, dur: 0.26, delay: 0.11 });
  },
  // Upward swoop for a rank gain.
  rankup: () => {
    tone({ freq: 440, dur: 0.28, type: 'triangle', slideTo: 880, gain: 0.14 });
  },
  // Short ref's whistle.
  whistle: () => {
    tone({ freq: 2000, dur: 0.16, type: 'square', gain: 0.08 });
    tone({ freq: 2100, dur: 0.18, type: 'square', gain: 0.08, delay: 0.04 });
  },
  // A little fanfare sting for pre-match hype.
  anthem: () => {
    [392, 523, 659, 784].forEach((f, i) =>
      tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.1, delay: i * 0.18 }),
    );
  },
};

/** Play a sound. No-op when disabled or audio isn't unlocked. Never throws. */
export function playSound(kind: WcSoundKind): void {
  if (!enabled || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  try {
    PATTERNS[kind]();
  } catch {
    /* a flaky AudioContext must never break the UI */
  }
}

/** Fire a haptic buzz (mobile). Tied to the same opt-in; feature-detected. */
export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported — ignore */
  }
}
