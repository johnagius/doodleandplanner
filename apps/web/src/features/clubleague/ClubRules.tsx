import {
  CLUB_POINTS,
  CLUB_TOTALS_LINE,
  CLUB_TROPHY_SECOND,
  CLUB_TROPHY_TOP,
  type ClubLeagueState,
} from '@dap/shared';
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

      <Section emoji="🎯" title="1 · Three markets per fixture">
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

      <Section emoji="📅" title="2 · Fixtures are automatic">
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

      <Section emoji="🗂️" title="3 · Periods, League 1 & League 2">
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

      <Section emoji="🏁" title="4 · The finale — two trophies">
        <p>
          The final period is a double title decider. Everyone’s season points feed the seeding,
          then two sets of contenders <strong>reset to level</strong> and fight head-to-head over
          the closing fixtures:
        </p>
        <ul>
          <li className="club-rule-trophy">
            <TrophyIcon size={26} />
            <span>
              <strong>{CLUB_TROPHY_TOP.runInName}</strong> — the top {club.runInContenders} players
              overall battle for <strong>{CLUB_TROPHY_TOP.name}</strong>, the big one.
            </span>
          </li>
          <li className="club-rule-trophy">
            <ShieldIcon size={26} />
            <span>
              <strong>{CLUB_TROPHY_SECOND.runInName}</strong> — the top {club.runInContenders} of
              League 2 play for <strong>{CLUB_TROPHY_SECOND.name}</strong> — a cool prize of its
              own, a notch below the Crown.
            </span>
          </li>
        </ul>
        <p>
          Because points reset, a season-long chase can still be caught right at the death — and
          even if you never troubled the leaders, there’s silverware to fight for.
        </p>
      </Section>

      <Section emoji="🧮" title="5 · The overall table">
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
