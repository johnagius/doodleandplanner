import type { ClubLeagueState, ClubSide, FixtureDraft } from '@dap/shared';
import { findFixture } from '@dap/shared';
import { useState } from 'react';
import { Modal } from '../../components/Modal.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { fromLocalInput, toLocalInput } from './clubFormat.js';

const OPPONENT = '__other__';

/** Organiser modal to add a new fixture or edit/reschedule an existing one. */
export function AdminFixtureForm({
  club,
  editingId,
  onClose,
}: {
  club: ClubLeagueState;
  /** null = closed, '' = adding new, else the fixture id being edited. */
  editingId: string | null;
  onClose: () => void;
}) {
  const addFixture = useClubLeagueStore((s) => s.addFixture);
  const editFixture = useClubLeagueStore((s) => s.editFixture);
  const deleteFixture = useClubLeagueStore((s) => s.deleteFixture);
  const existing = editingId ? findFixture(club, editingId) : undefined;

  const [competitionId, setCompetitionId] = useState(
    existing?.competitionId ?? club.competitions[0]?.id ?? '',
  );
  const [home, setHome] = useState<SideState>(() => sideState(existing?.home));
  const [away, setAway] = useState<SideState>(() => sideState(existing?.away));
  const [kickoff, setKickoff] = useState(() => toLocalInput(existing?.kickoff ?? defaultKickoff()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const open = editingId !== null;

  const submit = () => {
    const h = resolveSide(club, home);
    const a = resolveSide(club, away);
    if (!h || !a) {
      setError('Both teams need a name.');
      return;
    }
    if (!kickoff) {
      setError('Set a kick-off date & time.');
      return;
    }
    const draft: FixtureDraft = {
      competitionId,
      home: h,
      away: a,
      kickoff: fromLocalInput(kickoff),
      note: note.trim() || undefined,
    };
    if (existing) void editFixture(existing.id, draft);
    else void addFixture(draft);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit fixture' : 'Add fixture'}>
      <div className="stack" style={{ gap: '0.75rem' }}>
        <label className="field">
          Competition
          <select
            className="select"
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
          >
            {club.competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>

        <SidePicker club={club} label="Home team" side={home} onChange={setHome} />
        <SidePicker club={club} label="Away team" side={away} onChange={setAway} />

        <label className="field">
          Kick-off (Malta time)
          <input
            type="datetime-local"
            className="input"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
          />
        </label>

        <label className="field">
          Note (optional)
          <input
            className="input"
            placeholder="e.g. 2nd leg, postponed…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p className="banner banner-danger" style={{ margin: 0 }}>
            {error}
          </p>
        )}

        <div className="row spread">
          {existing ? (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (window.confirm('Delete this fixture and its predictions?')) {
                  void deleteFixture(existing.id);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="row" style={{ gap: '0.4rem' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
              {existing ? 'Save' : 'Add fixture'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface SideState {
  teamId: string; // a tracked team id, or OPPONENT
  name: string; // free-text opponent name
  short: string;
}

function sideState(side?: ClubSide): SideState {
  if (!side) return { teamId: OPPONENT, name: '', short: '' };
  if (side.teamId) return { teamId: side.teamId, name: side.name, short: side.short };
  return { teamId: OPPONENT, name: side.name, short: side.short };
}

function resolveSide(club: ClubLeagueState, s: SideState): ClubSide | null {
  if (s.teamId !== OPPONENT) {
    const t = club.teams.find((x) => x.id === s.teamId);
    if (t) return { name: t.name, short: t.short, color: t.color, teamId: t.id };
  }
  const name = s.name.trim();
  if (!name) return null;
  const short = (s.short.trim() || name.slice(0, 3)).toUpperCase();
  return { name, short };
}

function SidePicker({
  club,
  label,
  side,
  onChange,
}: {
  club: ClubLeagueState;
  label: string;
  side: SideState;
  onChange: (s: SideState) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <select
        className="select"
        value={side.teamId}
        onChange={(e) => onChange({ ...side, teamId: e.target.value })}
      >
        <optgroup label="Our clubs">
          {club.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.country} {t.name}
            </option>
          ))}
        </optgroup>
        <option value={OPPONENT}>Other team…</option>
      </select>
      {side.teamId === OPPONENT && (
        <div className="row" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
          <input
            className="input"
            placeholder="Opponent name"
            value={side.name}
            onChange={(e) => onChange({ ...side, name: e.target.value })}
          />
          <input
            className="input club-short-input"
            placeholder="ABB"
            maxLength={4}
            value={side.short}
            onChange={(e) => onChange({ ...side, short: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function defaultKickoff(): string {
  // Seed the picker with the next Saturday 15:00 UTC-ish; the organiser adjusts.
  const base = new Date('2026-08-15T15:00:00.000Z');
  return base.toISOString();
}
