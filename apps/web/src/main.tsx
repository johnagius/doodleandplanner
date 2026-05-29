import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './styles/global.css';

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
