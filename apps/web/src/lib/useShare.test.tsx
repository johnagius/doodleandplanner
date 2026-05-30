import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/Toast.js';
import { useShare } from './useShare.js';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error reset between tests
  delete navigator.share;
});

describe('useShare', () => {
  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    const { result } = renderHook(() => useShare(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current({ title: 'T', text: 'hi', url: 'https://x.test/r/abc' });
    });
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'hi', url: 'https://x.test/r/abc' });
    expect(ok).toBe(true);
  });

  it('returns false when the user dismisses the native sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.assign(navigator, { share });
    const { result } = renderHook(() => useShare(), { wrapper });

    let ok = true;
    await act(async () => {
      ok = await result.current({ url: 'https://x.test/r/abc' });
    });
    expect(ok).toBe(false);
  });

  it('falls back to clipboard when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { result } = renderHook(() => useShare(), { wrapper });

    await act(async () => {
      await result.current({ url: 'https://x.test/r/abc' });
    });
    expect(writeText).toHaveBeenCalledWith('https://x.test/r/abc');
  });
});
