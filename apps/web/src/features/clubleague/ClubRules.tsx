import {
  CLUB_ESPN_TEAM_IDS,
  CLUB_POINTS,
  CLUB_TOTALS_LINE,
  CLUB_TROPHY_MEISTER,
  CLUB_TROPHY_SECOND,
  CLUB_TROPHY_TOP,
  espnCrestUrl,
  type ClubLeagueState,
  type ClubTeam,
} from '@dap/shared';
import { useState } from 'react';
import { ShieldIcon, TrophyIcon } from './TrophyIcons.js';

/**
 * The in-app rulebook. World Cup players struggled to understand how points were
 * awarded, so this lays out every rule — scoring, the fixtures, the divisions and
 * the run-in — in plain language with worked examples.
 */
export function ClubRules({ club }: { club: ClubLeagueState }) {
  return (
    <div className="stack club-rules">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>📖 How it all works</h2>
        <p className="muted" style={{ margin: 0 }}>
          Predict every fixture our clubs play — across their league, the domestic cups and the
          Champions League. There are no exact-score guesses: each game is three quick bets. The
          closer you read the game, the more you score.
        </p>
      </div>

      <Section emoji="🛡️" title="1 · The ten clubs">
        <p>
          We track <strong>ten clubs</strong> across England, Spain and Italy.{' '}
          <strong>Every single game they play is on the board to bet</strong> — league, domestic
          cups, the Champions League, the Europa League, the Super Cups and the Club World Cup. If
          one of these clubs is playing, you can predict it.
        </p>
        <div className="club-roster">
          {club.teams.map((t) => (
            <ClubCrest key={t.id} team={t} />
          ))}
        </div>
      </Section>

      <Section emoji="🎯" title="2 · Three markets per fixture">
        <p>
          For every fixture you can fill in up to three independent markets. Each one is scored on
          its own, so a wrong result doesn’t sink your whole ticket:
        </p>
        <div className="club-rule-grid">
          <RuleCard
            pts={CLUB_POINTS.result}
            label="Result — 1 / X / 2"
            desc="Home win (1), draw (X) or away win (2)."
            example="Pick 1, home team wins → +3"
          />
          <RuleCard
            pts={CLUB_POINTS.totals}
            label={`Goals — Over / Under ${CLUB_TOTALS_LINE}`}
            desc="Will there be 3 or more goals in total? Over = 3+, Under = 0–2."
            example="Pick Over, it ends 2–1 (3 goals) → +2"
          />
          <RuleCard
            pts={CLUB_POINTS.btts}
            label="Both teams to score"
            desc="Yes if both teams score at least one; No otherwise."
            example="Pick Yes, it ends 2–1 → +2"
          />
        </div>
        <p className="muted small">
          Leave a market blank if you’re unsure — a blank simply scores nothing, it never costs you.
          A perfect fixture is worth{' '}
          <strong>{CLUB_POINTS.result + CLUB_POINTS.totals + CLUB_POINTS.btts} points</strong> (all
          three right).
        </p>
      </Section>

      <Section emoji="📅" title="3 · Fixtures are automatic">
        <p>
          You never have to add games. Every fixture our ten clubs play — league, domestic cups and
          Europe — appears <strong>automatically</strong>, straight from a live feed:
        </p>
        <ul>
          <li>New cup rounds show up as soon as they’re drawn.</li>
          <li>
            If a club is knocked out of a cup, its future games in that cup simply never appear —
            there’s nothing to bet on.
          </li>
          <li>If a kick-off is moved, the date and time update themselves.</li>
          <li>Finished games fill in their score on their own, and points land straight away.</li>
        </ul>
        <p>
          Your picks <strong>lock at kick-off</strong>: after that they’re revealed to everyone and
          can’t be changed. The organiser only ever steps in for a rare edge case — for example, a
          cup tie that goes to extra time, where the 90-minute markets should settle on the
          regulation score.
        </p>
      </Section>

      <Section emoji="🗂️" title="4 · Periods, League 1 & League 2">
        <p>
          The season is split into <strong>periods</strong>. The opening period is one combined
          table; where you finish it decides your division. From then on the field splits into two:
        </p>
        <ul>
          <li>
            <strong>League 1</strong> — the top {club.league1Size} players.
          </li>
          <li>
            <strong>League 2</strong> — everyone else.
          </li>
        </ul>
        <p>
          <strong>Promotion &amp; relegation happen only at the end of a period</strong> — on set
          calendar dates, never after a single game. When a period closes, the bottom of League 1
          drops down and the top of League 2 comes up. Every player still predicts every fixture —
          the divisions just decide which table you’re racing in, so even if a leader runs away with
          the overall total, there’s always a live battle in your own league.
        </p>
      </Section>

      <Section emoji="🏁" title="5 · The finale — how it plays out">
        <p>
          The final period is the decider. It runs in three acts. First, the two divisions are{' '}
          <strong>cut</strong> — the season table entering the finale sets who’s still standing:
        </p>
        <ul>
          <li>
            <strong>Top league (League 1):</strong> the{' '}
            <strong>bottom-placed player is knocked out</strong> of the title race. With{' '}
            {club.league1Size} in League 1, that leaves{' '}
            <strong>{topRunInCount(club)} still competing</strong>.
          </li>
          <li>
            <strong>Bottom league (League 2):</strong> the{' '}
            <strong>last-placed player is knocked out</strong> too. With {leagueTwoSize(club)} in
            League 2, that leaves <strong>{secondRunInCount(club)} still competing</strong>.
          </li>
        </ul>
        <p>
          Second, <strong>everyone still standing resets to 0 points</strong>. The whole season’s
          lead is wiped — the finale is a clean sprint decided only on the closing fixtures. Third,
          they race head-to-head for two trophies:
        </p>
        <ul>
          <li className="club-rule-trophy">
            <TrophyIcon size={26} />
            <span>
              <strong>{CLUB_TROPHY_TOP.runInName}</strong> — the {topRunInCount(club)} survivors of
              League 1 battle for <strong>{CLUB_TROPHY_TOP.name}</strong>, the big one.
            </span>
          </li>
          <li className="club-rule-trophy">
            <ShieldIcon size={26} />
            <span>
              <strong>{CLUB_TROPHY_SECOND.runInName}</strong> — the {secondRunInCount(club)}{' '}
              survivors of League 2 play for <strong>{CLUB_TROPHY_SECOND.name}</strong> — a prize of
              its own, a notch below the {CLUB_TROPHY_TOP.name}.
            </span>
          </li>
        </ul>
        <p className="muted small">
          The knocked-out players still predict every game to the end — the results just don’t win
          them a trophy. Because points reset, a season-long chase can still be reeled in right at
          the death, and a mid-table run can still end with silverware.
        </p>
      </Section>

      <Section emoji="🥇" title="6 · The Meister Cup — the grand finale">
        <p>
          One trophy sits above them all. The <strong>{CLUB_TROPHY_TOP.name}</strong> winner and the{' '}
          <strong>{CLUB_TROPHY_SECOND.name}</strong> winner meet in a one-game showdown: the{' '}
          <strong>{CLUB_TROPHY_MEISTER.name}</strong>.
        </p>
        <ul>
          <li>
            It’s decided purely by their bet on the <strong>Champions League final</strong> —
            whoever scores more across the three markets lifts it.
          </li>
          <li>
            <strong>Only those two may predict the Champions League final.</strong> Everyone else’s
            season is already done — the leagues deliberately finish before the final is played.
          </li>
          <li>
            <strong>Level on the final?</strong> The tie is broken by the{' '}
            <strong>highest points across the closing week</strong>. If they’re still dead level,
            the {CLUB_TROPHY_TOP.name} winner — the more prestigious seat — takes it.
          </li>
        </ul>
        <p className="muted small">
          So the very last kick of the season can crown the overall champion: win your run-in, then
          read the Champions League final better than your rival.
        </p>
      </Section>

      <Section emoji="🧮" title="7 · The overall table">
        <p>
          Your <strong>season total</strong> is simply every point you’ve earned across all
          fixtures. It drives the overall standings and decides who enters the Champions Run-In.
          Tie-breakers, in order: most correct results, then most individual markets called right,
          then alphabetical.
        </p>
      </Section>
    </div>
  );
}

/** A club's official crest + name (falls back to a coloured code badge). */
function ClubCrest({ team }: { team: ClubTeam }) {
  const [broken, setBroken] = useState(false);
  const espnId = CLUB_ESPN_TEAM_IDS[team.id];
  const crest = espnId ? espnCrestUrl(espnId) : undefined;
  return (
    <div className="club-roster-item" title={team.name}>
      {crest && !broken ? (
        <img
          className="club-roster-crest"
          src={crest}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="club-roster-badge" style={{ background: team.color }} aria-hidden>
          {team.short}
        </span>
      )}
      <span className="club-roster-name">{team.name}</span>
    </div>
  );
}

/** How many stay in each division's finale after the last-placed player is cut. */
function leagueTwoSize(club: ClubLeagueState): number {
  return Math.max(0, club.predictors.length - club.league1Size);
}
function topRunInCount(club: ClubLeagueState): number {
  return Math.max(0, club.league1Size - 1);
}
function secondRunInCount(club: ClubLeagueState): number {
  return Math.max(0, leagueTwoSize(club) - 1);
}

function Section({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card stack club-rule-section">
      <h3 style={{ margin: 0 }}>
        <span aria-hidden>{emoji}</span> {title}
      </h3>
      {children}
    </section>
  );
}

function RuleCard({
  pts,
  label,
  desc,
  example,
}: {
  pts: number;
  label: string;
  desc: string;
  example: string;
}) {
  return (
    <div className="club-rule-card">
      <span className="club-rule-pts">+{pts}</span>
      <div>
        <div className="club-rule-label">{label}</div>
        <div className="muted small">{desc}</div>
        <div className="small club-rule-example">{example}</div>
      </div>
    </div>
  );
}
