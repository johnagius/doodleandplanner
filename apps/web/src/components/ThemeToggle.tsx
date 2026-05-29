import { useState } from 'react';
import { resolveTheme, toggleTheme, type Theme } from '../lib/theme.js';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(resolveTheme());
  return (
    <button
      className="btn btn-sm btn-ghost"
      aria-label="Toggle dark mode"
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
