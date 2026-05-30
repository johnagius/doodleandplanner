import { useEffect, useState } from 'react';

/**
 * Reactively track whether the dark theme is active. The theme is expressed as
 * a `data-theme` attribute on <html> (see ./theme.ts); this hook subscribes to
 * changes so components — including the WebGL/3D hero — recolour live when the
 * user flips the toggle, instead of staying stale until remount.
 */
export function useThemeIsDark(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.getAttribute('data-theme') === 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
