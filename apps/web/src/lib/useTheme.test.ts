import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useThemeIsDark } from './useTheme.js';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('useThemeIsDark', () => {
  it('reads the initial theme from <html data-theme>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useThemeIsDark());
    expect(result.current).toBe(true);
  });

  it('defaults to light when no theme is set', () => {
    const { result } = renderHook(() => useThemeIsDark());
    expect(result.current).toBe(false);
  });

  it('reacts to live theme changes', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { result } = renderHook(() => useThemeIsDark());
    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await waitFor(() => expect(result.current).toBe(true));

    act(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
