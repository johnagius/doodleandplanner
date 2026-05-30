import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTitleAlert } from './useTitleAlert.js';

afterEach(() => {
  document.title = '';
});

describe('useTitleAlert', () => {
  it('prefixes the title with the count when > 0', () => {
    renderHook(() => useTitleAlert(2, 'Room · DAP'));
    expect(document.title).toBe('(2) Room · DAP');
  });

  it('shows just the base title when count is 0', () => {
    renderHook(() => useTitleAlert(0, 'Room · DAP'));
    expect(document.title).toBe('Room · DAP');
  });

  it('restores the base title on unmount', () => {
    const { unmount } = renderHook(() => useTitleAlert(3, 'Room · DAP'));
    expect(document.title).toBe('(3) Room · DAP');
    unmount();
    expect(document.title).toBe('Room · DAP');
  });
});
