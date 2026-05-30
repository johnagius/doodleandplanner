import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { applyTheme, resolveTheme } from './lib/theme.js';
import './styles/global.css';

// Apply the saved/system theme before first paint to avoid a flash.
applyTheme(resolveTheme());

// Vite injects BASE_URL from the `base` config; React Router needs it without
// the trailing slash so deep links work on GitHub Pages (/repo/) and Cloudflare.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Register the service worker in production for offline support + installability.
// Kept out of dev so it never interferes with HMR or Playwright runs.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // When a new worker takes control (after a deploy), reload once so the fresh
  // build is used instead of a stale cached bundle. Guarded to real updates
  // (a controller already existed), so the first install doesn't double-load.
  if (navigator.serviceWorker.controller) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => reg.update())
      .catch(() => undefined);
  });
}
