import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeToggle } from './components/ThemeToggle.js';
import { ToastProvider } from './components/Toast.js';
import { WelcomeModal } from './components/WelcomeModal.js';
import { HomePage } from './features/home/HomePage.js';
import { RoomPage } from './features/room/RoomPage.js';
import { WorldCupPage } from './features/worldcup/WorldCupPage.js';
import { ClubLeaguePage } from './features/clubleague/ClubLeaguePage.js';
import { NotFoundPage } from './features/home/NotFoundPage.js';

export function App() {
  // Club Football stands on its own — it hides the Doodle & Planner shell chrome
  // and runs full-width, so it doesn't read as a sub-page.
  const standalone = useLocation().pathname === '/club';
  return (
    <ToastProvider>
      <WelcomeModal />
      <div className="app-shell">
        {!standalone && (
          <header className="topbar">
            <Link to="/" className="brand">
              <span className="logo" aria-hidden>
                ✏️
              </span>
              <span className="brand-name">Doodle &amp; Planner</span>
            </Link>
            <div className="row" style={{ gap: '0.4rem' }}>
              <Link className="btn btn-sm btn-ghost" to="/world-cup">
                ⚽ World Cup
              </Link>
              <Link className="btn btn-sm btn-ghost" to="/club">
                🏆 Club Footy
              </Link>
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
        )}
        <main className="grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/r/:slug" element={<RoomPage />} />
            <Route path="/world-cup" element={<WorldCupPage />} />
            <Route path="/club" element={<ClubLeaguePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
