/** Light/dark theme preference, persisted per device and applied via a
 * `data-theme` attribute on <html> that the stylesheet keys off. */
export type Theme = 'light' | 'dark';

const KEY = 'dap:theme';

export function systemTheme(): Theme {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  const v = globalThis.localStorage?.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

/** The active theme: an explicit choice if set, else the OS preference. */
export function resolveTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme: Theme): void {
  globalThis.localStorage?.setItem(KEY, theme);
  applyTheme(theme);
}

/** Flip between light and dark, persist, and return the new value. */
export function toggleTheme(): Theme {
  const next: Theme = resolveTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
