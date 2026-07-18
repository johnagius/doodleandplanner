import {
  formForTeam,
  standingForTeam,
  type ClubFixture,
  type ClubMatchInfo,
  type ClubTeamForm,
} from '@dap/shared';
import { Modal } from '../../components/Modal.js';
import { useClubMatch } from './clubMatch.js';
import { TeamChip } from './TeamChip.js';

/** Match centre: real bookmaker odds (as 1/X/2 %), each side's league position &
 * recent form, and head-to-head history. Read-only context, fetched on open. */
export function ClubMatchModal({
  fixture,
  open,
  onClose,
}: {
  fixture: ClubFixture;
  open: boolean;
  onClose: () => void;
}) {
  const { info, loading } = useClubMatch(fixture, open);

  return (
    <Modal open={open} onClose={onClose} title="📊 Match centre">
      <div className="stack" style={{ gap: '0.8rem' }}>
        <div className="club-mc-teams">
          <TeamChip side={fixture.home} />
          <span className="muted">v</span>
          <TeamChip side={fixture.away} align="right" />
        </div>

        {loading && (
          <p className="muted small" style={{ margin: 0 }}>
            Loading live data…
          </p>
        )}
        {!loading && !info && (
          <p className="muted small" style={{ margin: 0 }}>
            No live match data available for this fixture yet.
          </p>
        )}
        {info && <MatchBody fixture={fixture} info={info} />}
      </div>
    </Modal>
  );
}

function MatchBody({ fixture, info }: { fixture: ClubFixture; info: ClubMatchInfo }) {
  const homeName = info.homeName ?? fixture.home.name;
  const awayName = info.awayName ?? fixture.away.name;
  const homeStand = standingForTeam(info, homeName);
  const awayStand = standingForTeam(info, awayName);
  const homeForm = formForTeam(info, info.homeId, homeName);
  const awayForm = formForTeam(info, info.awayId, awayName);

  return (
    <>
      {info.odds && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">📈 Odds ({info.odds.provider})</h4>
          <div className="club-odds-bar" aria-hidden>
            <span className="club-odds-seg home" style={{ width: `${info.odds.homePct}%` }}>
              1
            </span>
            <span className="club-odds-seg draw" style={{ width: `${info.odds.drawPct}%` }}>
              X
            </span>
            <span className="club-odds-seg away" style={{ width: `${info.odds.awayPct}%` }}>
              2
            </span>
          </div>
          <div className="club-odds-legend muted small">
            <span>
              1 {fixture.home.short} {info.odds.homePct}%
            </span>
            <span>X {info.odds.drawPct}%</span>
            <span>
              2 {fixture.away.short} {info.odds.awayPct}%
            </span>
            {info.odds.overPct != null && info.odds.ouLine != null && (
              <span>
                Over {info.odds.ouLine}: {info.odds.overPct}%
              </span>
            )}
          </div>
        </section>
      )}

      {(homeStand || awayStand) && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">🏆 League position</h4>
          <div className="club-mc-standings">
            <PositionLine label={fixture.home.short} row={homeStand} />
            <PositionLine label={fixture.away.short} row={awayStand} />
          </div>
        </section>
      )}

      {(homeForm?.games.length || awayForm?.games.length) && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">🔵 Recent form</h4>
          <FormLine label={fixture.home.short} form={homeForm} />
          <FormLine label={fixture.away.short} form={awayForm} />
        </section>
      )}

      {info.keyEvents.length > 0 && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">⏱ Key events</h4>
          <ul className="club-events-list">
            {info.keyEvents.map((e, i) => (
              <li key={i}>
                <span className="club-ev-min">{e.minute}</span>
                <span aria-hidden>
                  {e.scoring
                    ? '⚽'
                    : e.type === 'Yellow Card'
                      ? '🟨'
                      : e.type === 'Red Card'
                        ? '🟥'
                        : e.type === 'Substitution'
                          ? '🔁'
                          : '•'}
                </span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {info.stats.length > 0 && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">📊 Match stats</h4>
          <div className="club-statrows">
            {info.stats.map((s) => (
              <div key={s.label} className="club-statrow">
                <span className="club-statrow-h">{s.home}</span>
                <span className="club-statrow-l muted small">{s.label}</span>
                <span className="club-statrow-a">{s.away}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {info.lineups.length > 0 && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">👕 Line-ups</h4>
          <div className="club-lineups">
            {info.lineups.map((l) => (
              <div key={l.teamId} className="club-lineup">
                <div className="club-lineup-h">
                  <strong>{l.name}</strong>
                  {l.formation ? <span className="muted small"> · {l.formation}</span> : null}
                </div>
                <ol className="club-lineup-xi">
                  {l.starters.map((p, i) => (
                    <li key={i}>
                      <span className="muted small">{p.jersey ?? ''}</span> {p.name}
                      {p.pos ? <span className="muted small"> {p.pos}</span> : null}
                    </li>
                  ))}
                </ol>
                {l.subs.length > 0 && (
                  <p className="muted small" style={{ margin: 0 }}>
                    Subs: {l.subs.map((p) => p.name).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {info.h2h.length > 0 && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">🤝 Head to head</h4>
          <ul className="club-h2h">
            {info.h2h.slice(0, 8).map((g, i) => (
              <li key={i}>
                <span className="muted small">{new Date(g.date).getUTCFullYear()}</span>
                <span className="club-h2h-score">
                  {g.homeName}{' '}
                  <strong>
                    {g.homeScore ?? '?'}–{g.awayScore ?? '?'}
                  </strong>{' '}
                  {g.awayName}
                </span>
                <span className="muted small">{g.competition}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {info.news.length > 0 && (
        <section className="club-mc-section">
          <h4 className="club-mc-h">📰 News</h4>
          <ul className="club-news">
            {info.news.map((a, i) => (
              <li key={i}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.headline}
                  </a>
                ) : (
                  a.headline
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PositionLine({ label, row }: { label: string; row: ReturnType<typeof standingForTeam> }) {
  if (!row) return null;
  return (
    <div className="club-mc-pos">
      <strong>{label}</strong>
      <span>
        {ordinal(row.rank)} · {row.points} pts
        {row.record ? ` · ${row.record}` : ''}
      </span>
    </div>
  );
}

function FormLine({ label, form }: { label: string; form: ClubTeamForm | undefined }) {
  if (!form || form.games.length === 0) return null;
  return (
    <div className="club-mc-form">
      <strong>{label}</strong>
      <span className="club-form-dots">
        {form.games.map((g, i) => (
          <span
            key={i}
            className={`club-form-dot ${g.result.toLowerCase()}`}
            title={`${g.result} ${g.score} ${g.home ? 'vs' : '@'} ${g.opponent} (${g.competition})`}
          >
            {g.result}
          </span>
        ))}
      </span>
    </div>
  );
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
