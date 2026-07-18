import {
  clubActivity,
  clubCombinatorsLeft,
  clubLeaderboardWithMovement,
  clubMatchdayRecap,
  clubPlayedCount,
  clubRivalry,
  clubWeekParticipation,
  computeDivisions,
  findCompetition,
  findPrediction,
  orderedFixtures,
  type ClubLeagueState,
  type ClubResult,
} from '@dap/shared';
import { useMemo } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { TeamChip } from './TeamChip.js';
import { liveScoresFromStore } from './liveScores.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The standalone side rail: leaderboard + who-pipped-who, the next game with a
 * pictorial market preview and a countdown, season progress and your stats. */
export function ClubSidebar({
  club,
  onGoFixtures,
}: {
  club: ClubLeagueState;
  onGoFixtures: () => void;
}) {
  const meId = useClubLeagueStore((s) => s.meId);
  const live = useClubLeagueStore((s) => s.live);
  const liveScores: Record<string, ClubResult> = liveScoresFromStore(club, live);
  const liveCount = Object.keys(liveScores).length;

  return (
    <div className="club-sidebar">
      <Leaderboard club={club} meId={meId} liveScores={liveCount ? liveScores : undefined} />
      <LastRound club={club} />
      <NextUp club={club} meId={meId} onGoFixtures={onGoFixtures} />
      <ThisWeekPicks club={club} meId={meId} />
      <SeasonProgress club={club} />
      {meId && (
        <YourStats club={club} meId={meId} liveScores={liveCount ? liveScores : undefined} />
      )}
      <Activity club={club} meId={meId} />
    </div>
  );
}

/** Who's playing this week: each player's pick count for the week's fixtures —
 * counts only, so nobody's actual picks leak before kick-off. */
function ThisWeekPicks({ club, meId }: { club: ClubLeagueState; meId: string | null }) {
  const part = clubWeekParticipation(club, new Date());
  if (!part || part.total === 0) return null;
  const rows = [...part.rows].sort((a, b) => b.picked - a.picked || a.name.localeCompare(b.name));
  return (
    <Card title="🗓 This week's picks">
      <ul className="club-week-picks">
        {rows.map((r) => {
          const done = r.picked >= part.total;
          const none = r.picked === 0;
          return (
            <li key={r.predictorId} className={r.predictorId === meId ? 'is-me' : ''}>
              <span className="club-week-name">
                {done ? '✅' : none ? '⚪️' : '⏳'} {r.name}
              </span>
              <span className={`club-week-count ${none ? 'is-none' : ''}`}>
                {r.picked}/{part.total}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small" style={{ margin: 0 }}>
        Pick counts only — nobody can see what anyone picked until kick-off.
      </p>
    </Card>
  );
}

/** "17:42 relative" for an ISO timestamp — "just now", "2h ago", "3d ago". */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** A live activity feed — every bet as it's placed (clocked, no content) and each
 * full-time result, newest first. */
function Activity({ club, meId }: { club: ClubLeagueState; meId: string | null }) {
  const items = clubActivity(club, 12);
  if (items.length === 0) return null;
  return (
    <Card title="🔔 Activity">
      <ul className="club-activity">
        {items.map((it, i) => (
          <li key={`${it.kind}-${it.fixtureId}-${it.predictorId ?? ''}-${i}`}>
            {it.kind === 'pick' ? (
              <span>
                🎫 <strong>{it.predictorId === meId ? 'You' : it.name}</strong> picked {it.home} v{' '}
                {it.away}
              </span>
            ) : (
              <span>
                ⚽ {it.home}{' '}
                <strong>
                  {it.result!.home}–{it.result!.away}
                </strong>{' '}
                {it.away} · FT
              </span>
            )}
            <span className="muted small club-activity-time">{ago(it.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card stack club-widget">
      <h3 className="club-widget-title">{title}</h3>
      {children}
    </section>
  );
}

function Leaderboard({
  club,
  meId,
  liveScores,
}: {
  club: ClubLeagueState;
  meId: string | null;
  liveScores?: Record<string, ClubResult>;
}) {
  const rows = clubLeaderboardWithMovement(club, liveScores);
  const played = clubPlayedCount(club);
  const rival = meId ? clubRivalry(club, meId, liveScores) : null;

  return (
    <Card title="🏆 Leaderboard">
      {played === 0 && !liveScores ? (
        <p className="muted small" style={{ margin: 0 }}>
          Standings appear after the first game is played.
        </p>
      ) : (
        <>
          <ol className="club-side-lb">
            {rows.slice(0, 5).map((r, i) => (
              <li key={r.predictorId} className={r.predictorId === meId ? 'is-me' : ''}>
                <span className="club-side-rank">{MEDALS[i] ?? i + 1}</span>
                <span className="club-side-name">{r.name}</span>
                {r.movement !== 0 && (
                  <span className={`club-move ${r.movement > 0 ? 'up' : 'down'}`}>
                    {r.movement > 0 ? `▲${r.movement}` : `▼${-r.movement}`}
                  </span>
                )}
                <span className="club-side-pts">{r.points}</span>
              </li>
            ))}
          </ol>
          {rival && (
            <p className="muted small club-side-rival" style={{ margin: 0 }}>
              {rival.rank === 1 ? '👑' : '🎯'} You’re <strong>{ordinal(rival.rank)}</strong> of{' '}
              {rival.of}
              {rival.ahead
                ? rival.ahead.gap === 0
                  ? ` — level with ${rival.ahead.name}`
                  : ` — ${rival.ahead.gap} behind ${rival.ahead.name}`
                : rival.behind
                  ? rival.behind.gap === 0
                    ? ` — level with ${rival.behind.name}`
                    : ` — ${rival.behind.gap} ahead of ${rival.behind.name}`
                  : ''}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** The soonest unplayed fixture: crests, a live countdown and a pictorial strip of
 * the three markets (with your pick highlighted). */
function NextUp({
  club,
  meId,
  onGoFixtures,
}: {
  club: ClubLeagueState;
  meId: string | null;
  onGoFixtures: () => void;
}) {
  const next = useMemo(() => {
    const now = Date.now();
    return (
      orderedFixtures(club).find((f) => !f.result && new Date(f.kickoff).getTime() >= now) ?? null
    );
  }, [club]);

  if (!next) {
    return (
      <Card title="⏭ Next up">
        <p className="muted small" style={{ margin: 0 }}>
          No upcoming fixtures right now — check back soon.
        </p>
      </Card>
    );
  }
  const comp = findCompetition(club, next.competitionId);
  const mine = meId ? findPrediction(club, next.id, meId) : undefined;

  return (
    <Card title="⏭ Next up">
      <div className="club-next-meta muted small">
        {comp?.emoji ?? '⚽'} {comp?.short ?? 'Match'} · {countdown(next.kickoff)}
      </div>
      <div className="club-next-teams">
        <TeamChip side={next.home} />
        <span className="muted">v</span>
        <TeamChip side={next.away} align="right" />
      </div>
      <MarketPreview label="Result" options={['1', 'X', '2']} pick={mine?.outcome} />
      <MarketPreview
        label="Goals 2.5"
        options={['Over', 'Under']}
        pick={mine?.totals === 'over' ? 'Over' : mine?.totals === 'under' ? 'Under' : undefined}
      />
      <MarketPreview
        label="Both score"
        options={['Yes', 'No']}
        pick={mine?.btts === 'yes' ? 'Yes' : mine?.btts === 'no' ? 'No' : undefined}
      />
      <button type="button" className="btn btn-sm btn-primary" onClick={onGoFixtures}>
        {mine?.outcome || mine?.totals || mine?.btts ? 'Review / edit pick' : 'Predict now'}
      </button>
    </Card>
  );
}

/** A pictorial market row — each option a pill, the player's pick lit up. */
function MarketPreview({
  label,
  options,
  pick,
}: {
  label: string;
  options: string[];
  pick?: string;
}) {
  return (
    <div className="club-mkt-preview">
      <span className="muted small">{label}</span>
      <span className="club-mkt-preview-opts">
        {options.map((o) => (
          <span key={o} className={`club-mkt-dot ${pick === o ? 'on' : ''}`}>
            {o}
          </span>
        ))}
      </span>
    </div>
  );
}

/** "What happened" in the latest match-day: top scorer + biggest climber. */
function LastRound({ club }: { club: ClubLeagueState }) {
  const recap = clubMatchdayRecap(club);
  if (!recap || (!recap.topGain && !recap.topClimb)) return null;
  return (
    <Card title="📣 Last round">
      {recap.topGain && (
        <div className="small">
          🔥 <strong>{recap.topGain.name}</strong> top-scored with{' '}
          <strong>+{recap.topGain.gained}</strong>
        </div>
      )}
      {recap.topClimb && recap.topClimb.predictorId !== recap.topGain?.predictorId && (
        <div className="small">
          📈 <strong>{recap.topClimb.name}</strong> climbed {recap.topClimb.delta} place
          {recap.topClimb.delta === 1 ? '' : 's'}
        </div>
      )}
      {recap.topClimb && recap.topClimb.predictorId === recap.topGain?.predictorId && (
        <div className="small">
          📈 …and climbed {recap.topClimb.delta} place{recap.topClimb.delta === 1 ? '' : 's'}
        </div>
      )}
    </Card>
  );
}

function SeasonProgress({ club }: { club: ClubLeagueState }) {
  const divisions = computeDivisions(club);
  const started = divisions.filter((d) => d.started);
  const currentPeriod = (started[started.length - 1] ?? divisions[0])?.period;
  const played = clubPlayedCount(club);
  const total = club.fixtures.length;
  const pct = total > 0 ? Math.round((played / total) * 100) : 0;

  return (
    <Card title="📅 Season">
      <div className="muted small">
        {club.season} · {currentPeriod ? currentPeriod.name : '—'}
      </div>
      <div
        className="club-progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Season progress: ${played} of ${total} fixtures played`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">
        {played} of {total} fixtures played
      </div>
    </Card>
  );
}

function YourStats({
  club,
  meId,
  liveScores,
}: {
  club: ClubLeagueState;
  meId: string;
  liveScores?: Record<string, ClubResult>;
}) {
  const rows = clubLeaderboardWithMovement(club, liveScores);
  const me = rows.find((r) => r.predictorId === meId);
  // Combinators left this week is measured against the next fixture's week.
  const next = orderedFixtures(club).find((f) => !f.result);
  const combiLeft = next ? clubCombinatorsLeft(club, meId, next.kickoff) : 2;

  return (
    <Card title="📊 Your season">
      <div className="club-stat-grid">
        <Stat label="Points" value={me?.points ?? 0} />
        <Stat label="Results right" value={me?.resultsRight ?? 0} />
        <Stat label="Markets right" value={me?.marketsRight ?? 0} />
        <Stat label="🎯 Combinators left" value={combiLeft} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="club-stat">
      <div className="club-stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

/** "in 3h 12m" / "in 2 days" / "kicking off" from now to a kickoff ISO. */
function countdown(kickoff: string): string {
  const ms = new Date(kickoff).getTime() - Date.now();
  if (ms <= 0) return 'kicking off';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
