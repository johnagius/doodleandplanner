import { lazy, Suspense } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeToggle } from './components/ThemeToggle.js';
import { ToastProvider } from './components/Toast.js';
import { WelcomeModal } from './components/WelcomeModal.js';

// Route pages are code-split so each board only ships its own JS — visiting
// /club no longer downloads the World Cup bundle (and vice-versa).
const HomePage = lazy(() =>
  import('./features/home/HomePage.js').then((m) => ({ default: m.HomePage })),
);
const RoomPage = lazy(() =>
  import('./features/room/RoomPage.js').then((m) => ({ default: m.RoomPage })),
);
const WorldCupPage = lazy(() =>
  import('./features/worldcup/WorldCupPage.js').then((m) => ({ default: m.WorldCupPage })),
);
const ClubLeaguePage = lazy(() =>
  import('./features/clubleague/ClubLeaguePage.js').then((m) => ({ default: m.ClubLeaguePage })),
);
const ClubPosterPage = lazy(() =>
  import('./features/clubleague/ClubPosterPage.js').then((m) => ({ default: m.ClubPosterPage })),
);
const NotFoundPage = lazy(() =>
  import('./features/home/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage })),
);

export function App() {
  // Club Football (and its countdown poster) stands on its own — it hides the
  // Doodle & Planner shell chrome and runs full-width, so it doesn't read as a
  // sub-page.
  const { pathname } = useLocation();
  const standalone = pathname === '/club' || pathname === '/club/poster';
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
          <Suspense fallback={<div className="container container-narrow empty">Loading…</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/r/:slug" element={<RoomPage />} />
              <Route path="/world-cup" element={<WorldCupPage />} />
              <Route path="/club" element={<ClubLeaguePage />} />
              <Route path="/club/poster" element={<ClubPosterPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </ToastProvider>
  );
}
