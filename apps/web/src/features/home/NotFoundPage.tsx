import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container container-narrow">
      <div className="card stack" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }} aria-hidden>
          🧭
        </div>
        <h1>Page not found</h1>
        <p className="muted">That doodle wandered off the page.</p>
        <div>
          <Link className="btn btn-primary" to="/">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
