import {
  clubCombinatorsLeft,
  clubLeaderboardWithMovement,
  clubPlayedCount,
  clubRivalry,
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
      <NextUp club={club} meId={meId} onGoFixtures={onGoFixtures} />
      <SeasonProgress club={club} />
      {meId && (
        <YourStats club={club} meId={meId} liveScores={liveCount ? liveScores : undefined} />
      )}
    </div>
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
      <div className="club-progress" aria-hidden>
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
