import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each case gets a fresh module so the singleton `enabled`/`ctx`/listeners reset.
async function freshModule() {
  vi.resetModules();
  return import('./wcSound.js');
}

function setVibrate(value: unknown): void {
  Object.defineProperty(navigator, 'vibrate', { value, configurable: true, writable: true });
}

describe('wcSound', () => {
  beforeEach(() => {
    localStorage.clear();
    const w = window as unknown as Record<string, unknown>;
    delete w.AudioContext;
    delete w.webkitAudioContext;
    setVibrate(undefined);
  });

  it('defaults to OFF', async () => {
    const s = await freshModule();
    expect(s.isSoundEnabled()).toBe(false);
  });

  it('persists the setting to localStorage and back', async () => {
    const s = await freshModule();
    expect(s.setSoundEnabled(true)).toBe(true);
    expect(s.isSoundEnabled()).toBe(true);
    expect(localStorage.getItem('dap:wc:sound')).toBe('1');
    s.setSoundEnabled(false);
    expect(s.isSoundEnabled()).toBe(false);
    expect(localStorage.getItem('dap:wc:sound')).toBeNull();
  });

  it('reads an already-enabled setting on load', async () => {
    localStorage.setItem('dap:wc:sound', '1');
    const s = await freshModule();
    expect(s.isSoundEnabled()).toBe(true);
  });

  it('never constructs an AudioContext on import — only on the enabling gesture', async () => {
    const ctor = vi.fn(() => ({ state: 'running', currentTime: 0, resume: vi.fn() }));
    (window as unknown as Record<string, unknown>).AudioContext = ctor;
    const s = await freshModule();
    expect(ctor).not.toHaveBeenCalled(); // import alone must not unlock audio
    s.setSoundEnabled(true); // the "gesture"
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('playSound is a silent no-op (and never throws) when disabled', async () => {
    const ctor = vi.fn();
    (window as unknown as Record<string, unknown>).AudioContext = ctor;
    const s = await freshModule();
    expect(() => s.playSound('goal')).not.toThrow();
    expect(ctor).not.toHaveBeenCalled(); // disabled → never even unlocks
  });

  it('vibrate only fires when enabled and supported', async () => {
    const buzz = vi.fn();
    setVibrate(buzz);
    const s = await freshModule();
    s.vibrate(10); // disabled
    expect(buzz).not.toHaveBeenCalled();
    s.setSoundEnabled(true);
    s.vibrate([10, 20]);
    expect(buzz).toHaveBeenCalledWith([10, 20]);
  });

  it('vibrate is guarded when navigator.vibrate is missing', async () => {
    const s = await freshModule();
    s.setSoundEnabled(true);
    expect(() => s.vibrate(10)).not.toThrow();
  });
});
