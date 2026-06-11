import { WC_POINTS } from '@dap/shared';

const RULES: { pts: number; label: string; example: string; cls: string }[] = [
  {
    pts: WC_POINTS.exact,
    label: 'Exact score',
    example: 'pick 2–1, it ends 2–1',
    cls: 'wc-pts-exact',
  },
  {
    pts: WC_POINTS.goalDiff,
    label: 'Right margin',
    example: 'pick 2–1, it ends 3–2',
    cls: 'wc-pts-diff',
  },
  {
    pts: WC_POINTS.outcome,
    label: 'Right result',
    example: 'pick 2–0, it ends 1–0',
    cls: 'wc-pts-outcome',
  },
  {
    pts: WC_POINTS.close1,
    label: 'One goal off',
    example: 'pick 1–1, it ends 1–0',
    cls: 'wc-pts-close',
  },
  {
    pts: WC_POINTS.close2,
    label: 'Two goals off',
    example: 'pick 2–1, it ends 1–2',
    cls: 'wc-pts-close',
  },
];

/** Explains how points are awarded — the closer your guess, the more you score. */
export function ScoringLegend() {
  return (
    <details className="wc-legend card">
      <summary>
        <span className="wc-legend-title">🏆 How points work</span>
        <span className="muted small">the closer your guess, the more you score</span>
      </summary>
      <div className="wc-legend-grid">
        {RULES.map((r) => (
          <div key={r.label} className="wc-legend-item">
            <span className={`wc-legend-pts ${r.cls}`}>+{r.pts}</span>
            <div>
              <div className="wc-legend-label">{r.label}</div>
              <div className="muted small">{r.example}</div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
