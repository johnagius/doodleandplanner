import type { ReactNode } from 'react';

/** A friendly empty state with an icon, title and optional hint/action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden>
        {icon}
      </div>
      <div className="empty-state-title">{title}</div>
      {hint && <p className="muted small empty-state-hint">{hint}</p>}
      {action}
    </div>
  );
}

/** A consistent panel header: title, optional subtitle, and a right-side slot. */
export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="row spread row-wrap" style={{ gap: '0.75rem' }}>
      <div>
        <h2 className="card-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {subtitle && (
          <p className="muted small" style={{ margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
