import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, getStoredTheme, resolveTheme, setTheme, toggleTheme } from './theme.js';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to a stored value when present', () => {
    expect(getStoredTheme()).toBeNull();
    setTheme('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(resolveTheme()).toBe('dark');
  });

  it('falls back to system (light in jsdom) without a stored value', () => {
    expect(resolveTheme()).toBe('light');
  });

  it('applies the theme to the document element', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles, persists and returns the new theme', () => {
    expect(toggleTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(toggleTheme()).toBe('light');
    expect(getStoredTheme()).toBe('light');
  });
});
