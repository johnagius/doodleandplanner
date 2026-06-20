import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISH_LINGER_MS, useRecentlyFinished } from './useRecentlyFinished.js';

type LiveMap = Record<string, { status?: string } | undefined>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useRecentlyFinished', () => {
  it('does not linger on a match already finished at first sight', () => {
    const { result } = renderHook((live: LiveMap) => useRecentlyFinished(live), {
      initialProps: { m1: { status: 'FINISHED' } } as LiveMap,
    });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBeNull();
  });

  it('ignores a match that only ever surfaces finished (feed filled in late)', () => {
    const { result, rerender } = renderHook((live: LiveMap) => useRecentlyFinished(live), {
      initialProps: { m1: { status: 'SCHEDULED' } } as LiveMap,
    });
    act(() => void vi.advanceTimersByTime(1000));
    // A different match appears already finished — we never watched it play.
    rerender({ m1: { status: 'SCHEDULED' }, m2: { status: 'FINISHED' } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBeNull();
  });

  it('lingers on a match that finishes while watching, then lets go', () => {
    const { result, rerender } = renderHook((live: LiveMap) => useRecentlyFinished(live), {
      initialProps: { m1: { status: 'IN_PLAY' } } as LiveMap,
    });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBeNull();

    rerender({ m1: { status: 'FINISHED' } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe('m1');

    act(() => void vi.advanceTimersByTime(FINISH_LINGER_MS));
    expect(result.current).toBeNull();
  });
});
