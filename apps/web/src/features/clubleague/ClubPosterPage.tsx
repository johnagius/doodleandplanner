import {
  CLUB_COMBINATORS_PER_WEEK,
  CLUB_COMBINATOR_POINTS,
  CLUB_ESPN_TEAM_IDS,
  CLUB_POINTS,
  espnCrestUrl,
  seedClubLeague,
  type ClubTeam,
} from '@dap/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatFixtureDayLong } from './clubFormat.js';
import { CLUB_SEASON_KICKOFF, posterCountdown } from './posterCountdown.js';

/** Standalone countdown poster for the new Club Football competition — a
 * shareable page ("5 days to go!") with the ten clubs, a quick rules rundown
 * and a link straight onto the board. Needs no room state: everything on it
 * comes from the seed data and the fixed season kick-off date. */
export function ClubPosterPage() {
  // Predictor ids are random, but we only read the static seed data (teams,
  // season label), so a throw-away seed board is fine.
  const club = useMemo(() => seedClubLeague(), []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const c = posterCountdown(now);
  const kickoffDay = formatFixtureDayLong(CLUB_SEASON_KICKOFF);

  return (
    <div className="club-poster-stage">
      <section className="club-poster" aria-label={posterAria(c.phase, c.daysToGo)}>
        <div className="club-poster-ribbon">New competition · Season {club.season}</div>
        <h1 className="club-poster-title">⚽ Club Football</h1>
        <p className="club-poster-sub">The friends&rsquo; predictions league</p>

        <div className="club-poster-count" aria-hidden>
          {c.phase === 'countdown' ? (
            <>
              <div className="club-poster-count-num">{c.daysToGo}</div>
              <div className="club-poster-count-label">day{c.daysToGo === 1 ? '' : 's'} to go</div>
              <div className="club-poster-ticker">
                {c.days}d {pad2(c.hours)}:{pad2(c.minutes)}:{pad2(c.seconds)}
              </div>
            </>
          ) : c.phase === 'today' ? (
            <div className="club-poster-count-label club-poster-count-now">
              It&rsquo;s matchday — the season starts today!
            </div>
          ) : (
            <div className="club-poster-count-label club-poster-count-now">
              The season is under way!
            </div>
          )}
        </div>
        <p className="club-poster-date">Kicks off {kickoffDay}</p>

        <div className="club-poster-crests" aria-label="The ten clubs">
          {club.teams.map((t) => (
            <PosterCrest key={t.id} team={t} />
          ))}
        </div>

        <ul className="club-poster-rules">
          <li>
            <span aria-hidden>🎯</span> Predict every game our ten clubs play — league, cups &amp;
            Europe. Fixtures appear automatically.
          </li>
          <li>
            <span aria-hidden>🧮</span> Three calls per match: Result 1/X/2 (+{CLUB_POINTS.result})
            · Over/Under 2.5 (+{CLUB_POINTS.totals}) · Both teams to score (+{CLUB_POINTS.btts}).
          </li>
          <li>
            <span aria-hidden>🎲</span> Feeling brave? A Combinator pays {CLUB_COMBINATOR_POINTS} if
            all three land — 0 if any miss (max {CLUB_COMBINATORS_PER_WEEK} a week).
          </li>
          <li>
            <span aria-hidden>🏆</span> League 1 &amp; League 2 with promotion and relegation each
            period — then the top three fight out the Champions Run-In.
          </li>
        </ul>

        <p className="club-poster-cta">Predictions open now — grab your name on the board!</p>

        <div className="row club-poster-actions no-print">
          <ShareButton daysToGo={c.daysToGo} phase={c.phase} kickoffDay={kickoffDay} />
          <Link className="btn btn-primary" to="/club">
            ⚽ Open the board
          </Link>
        </div>
      </section>
    </div>
  );
}

function posterAria(phase: string, daysToGo: number): string {
  if (phase === 'countdown')
    return `Club Football countdown poster — ${daysToGo} day${daysToGo === 1 ? '' : 's'} to go`;
  return 'Club Football poster — the season has kicked off';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Official crest, falling back to a coloured code badge if it can't load. */
function PosterCrest({ team }: { team: ClubTeam }) {
  const [broken, setBroken] = useState(false);
  const espnId = CLUB_ESPN_TEAM_IDS[team.id];
  return espnId && !broken ? (
    <img
      className="club-poster-crest"
      src={espnCrestUrl(espnId)}
      alt={team.name}
      title={team.name}
      loading="lazy"
      width={38}
      height={38}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="club-badge" style={{ background: team.color }} title={team.name}>
      {team.short.slice(0, 3)}
    </span>
  );
}

/** Native share sheet where available, else copy a link to this poster. */
function ShareButton({
  daysToGo,
  phase,
  kickoffDay,
}: {
  daysToGo: number;
  phase: string;
  kickoffDay: string;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    const text =
      phase === 'countdown'
        ? `⚽ Club Football kicks off ${kickoffDay} — ${daysToGo} day${
            daysToGo === 1 ? '' : 's'
          } to go! Get on the board:`
        : '⚽ Club Football has kicked off — get your predictions in:';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Club Football — countdown', text, url });
        return;
      }
    } catch {
      /* user dismissed the share sheet — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link to share the poster:', url);
    }
  };
  return (
    <button type="button" className="btn" onClick={() => void share()}>
      {copied ? '✓ Link copied' : '📣 Share the poster'}
    </button>
  );
}
