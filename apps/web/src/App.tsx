import { Link, Route, Routes } from 'react-router-dom';
import { ThemeToggle } from './components/ThemeToggle.js';
import { ToastProvider } from './components/Toast.js';
import { HomePage } from './features/home/HomePage.js';
import { RoomPage } from './features/room/RoomPage.js';
import { NotFoundPage } from './features/home/NotFoundPage.js';

export function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="logo" aria-hidden>
              ✏️
            </span>
            <span className="brand-name">Doodle &amp; Planner</span>
          </Link>
          <div className="row" style={{ gap: '0.4rem' }}>
            <ThemeToggle />
            <a
              className="btn btn-sm btn-ghost"
              href="https://github.com/johnagius/doodleandplanner"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </header>
        <main className="grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/r/:slug" element={<RoomPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
