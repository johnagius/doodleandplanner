import {
  WC_SQUADS,
  fifaRankOf,
  teamRecord,
  type WcPlayerPos,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { Modal } from '../../components/Modal.js';
import { useTeamWiki } from './teamWiki.js';

const POS_GROUPS: Array<[WcPlayerPos, string]> = [
  ['GK', 'Goalkeepers'],
  ['DEF', 'Defenders'],
  ['MID', 'Midfielders'],
  ['FWD', 'Forwards'],
];

/** W/D/L pills for a team's form in this tournament so far. */
function FormDots({ form }: { form: Array<'W' | 'D' | 'L'> }) {
  if (form.length === 0) return <span className="muted small">—</span>;
  return (
    <span className="wc-form" aria-label={`Recent form ${form.join(' ')}`}>
      {form.slice(0, 5).map((r, i) => (
        <span key={i} className={`wc-form-dot wc-form-${r}`} aria-hidden>
          {r}
        </span>
      ))}
    </span>
  );
}

/**
 * A country/team panel: a Wikipedia blurb, this team's FIFA rank and tournament
 * form, and their full squad grouped by position. Opened by tapping a team.
 */
export function TeamProfileModal({
  team,
  wc,
  onClose,
}: {
  team: WcTeam;
  wc: WorldCupState;
  onClose: () => void;
}) {
  const { wiki, loading } = useTeamWiki(team);
  const rank = fifaRankOf(team.id);
  const record = teamRecord(wc, team.id);
  const squad = WC_SQUADS.filter((p) => p.nat === team.id);

  return (
    <Modal open onClose={onClose} title={`${team.flag} ${team.name}`}>
      <div className="stack wc-tp" style={{ gap: '0.85rem' }}>
        <div className="wc-tp-facts">
          {rank != null && (
            <span className="badge" title="FIFA world ranking">
              🌍 #{rank}
            </span>
          )}
          {record && record.played > 0 && (
            <span className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
              <span className="muted small">Form</span>
              <FormDots form={record.form} />
            </span>
          )}
          <span className="muted small">{squad.length} in the squad</span>
        </div>

        {wiki?.thumbnail && (
          <img className="wc-tp-thumb" src={wiki.thumbnail} alt="" loading="lazy" />
        )}
        {loading ? (
          <p className="muted small" style={{ margin: 0 }}>
            Loading…
          </p>
        ) : wiki?.extract ? (
          <p className="small wc-tp-bio">
            {wiki.extract.length > 420 ? `${wiki.extract.slice(0, 419)}…` : wiki.extract}
            {wiki.url && (
              <>
                {' '}
                <a href={wiki.url} target="_blank" rel="noopener noreferrer">
                  Wikipedia ↗
                </a>
              </>
            )}
          </p>
        ) : null}

        {squad.length > 0 && (
          <div className="wc-tp-squad">
            {POS_GROUPS.map(([pos, label]) => {
              const players = squad.filter((p) => p.pos === pos);
              if (players.length === 0) return null;
              return (
                <div key={pos} className="wc-tp-group">
                  <div className="muted small wc-tp-group-label">{label}</div>
                  <div className="wc-tp-players">
                    {players.map((p) => (
                      <span key={p.id} className="wc-tp-player">
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          Blurb via Wikipedia · squad &amp; ranking from our data.
        </p>
      </div>
    </Modal>
  );
}
