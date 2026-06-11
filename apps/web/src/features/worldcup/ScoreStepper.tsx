/** A compact 0–9 score stepper: [−] value [+]. Used for picks and results. */
export function ScoreStepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(99, n));
  return (
    <div className="wc-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="wc-step-btn"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= 0}
        aria-label={`${label}: one fewer`}
      >
        −
      </button>
      <span className="wc-step-value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="wc-step-btn"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled}
        aria-label={`${label}: one more`}
      >
        +
      </button>
    </div>
  );
}
