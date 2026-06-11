/** A compact "kicks off in 2h 15m" badge. `now` is passed in so every card can
 * share a single ticking clock. Renders nothing once kick-off has passed. */
export function Countdown({ kickoff, now }: { kickoff: string; now: number }) {
  const ms = new Date(kickoff).getTime() - now;
  if (ms <= 0) return null;
  return (
    <span className="badge wc-countdown" title="Time until kick-off (Malta time)">
      ⏱ {formatRemaining(ms)}
    </span>
  );
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
