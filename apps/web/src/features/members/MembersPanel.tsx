import { buildInviteUrl, findMember, summarizeResponsibilities } from '@dap/shared';
import { Avatar } from '../../components/Avatar.js';
import { appOrigin } from '../../lib/appOrigin.js';
import { formatMoney } from '../../lib/format.js';
import { downloadRoom } from '../../lib/roomFile.js';
import { useClipboard } from '../../lib/useClipboard.js';
import { useRoomStore } from '../../state/roomStore.js';
import { RoomSettingsCard } from './RoomSettingsCard.js';

export function MembersPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const rotateInvite = useRoomStore((s) => s.rotateInvite);
  const copy = useClipboard();

  const isOwner = state.room.createdBy === meId;
  const inviteUrl = buildInviteUrl(appOrigin(), {
    slug: state.room.slug,
    token: state.room.inviteToken,
  });

  return (
    <div className="stack">
      <div className="grid grid-2">
        <div className="card stack">
          <h3 className="card-title">Members ({state.room.members.length})</h3>
          <div className="stack" style={{ gap: '0.5rem' }}>
            {state.room.members.map((m) => (
              <div key={m.id} className="row spread">
                <div className="row" style={{ gap: '0.5rem' }}>
                  <Avatar member={m} />
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {m.name} {m.id === meId && <span className="muted small">(you)</span>}
                    </div>
                    {m.googleEmail && <div className="muted small">📅 {m.googleEmail}</div>}
                  </div>
                </div>
                {m.role === 'owner' && <span className="badge badge-primary">organiser</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="card stack">
          <h3 className="card-title">Invite friends</h3>
          <p className="muted small">
            Share this link.{' '}
            {state.room.settings.openJoin
              ? 'Anyone with it can join.'
              : 'Only people with this link can join.'}
          </p>
          <code className="input" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {inviteUrl}
          </code>
          <div className="row">
            <button
              className="btn btn-primary"
              onClick={() => copy(inviteUrl, 'Invite link copied')}
            >
              Copy link
            </button>
            {isOwner && (
              <button
                className="btn"
                onClick={() => rotateInvite()}
                title="Generate a new link and disable the old one"
              >
                Reset link
              </button>
            )}
          </div>
          <div className="divider" />
          <div className="row spread row-wrap">
            <div className="muted small">
              Room created {new Date(state.room.createdAt).toLocaleDateString()} · code{' '}
              <strong>{state.room.slug}</strong>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => downloadRoom(state)}
              title="Download this room as a file you can back up or open on another device"
            >
              ⬇️ Export room
            </button>
          </div>
        </div>
      </div>

      <ResponsibilitiesCard />
      <RoomSettingsCard />
    </div>
  );
}

function ResponsibilitiesCard() {
  const state = useRoomStore((s) => s.state)!;
  const currency = state.room.settings.currency;
  const rollups = summarizeResponsibilities({
    memberIds: state.room.members.map((m) => m.id),
    inventory: state.inventory,
    activities: state.activities,
    events: state.events,
    expenses: state.expenses ?? [],
  });

  // Only show once there's something assigned to anyone.
  const hasAny = rollups.some(
    (r) => r.bringing.length || r.keenOn.length || r.going.length || Math.abs(r.net) > 0.005,
  );
  if (!hasAny) return null;

  const name = (id: string) => findMember(state.room, id)?.name ?? 'Someone';

  return (
    <div className="card stack" aria-label="Who's doing what">
      <h3 className="card-title">🧩 Who’s doing what</h3>
      <div className="stack" style={{ gap: '0.6rem' }}>
        {rollups.map((r) => {
          const member = findMember(state.room, r.memberId);
          return (
            <div
              key={r.memberId}
              className="row"
              style={{ gap: '0.6rem', alignItems: 'flex-start' }}
            >
              {member && <Avatar member={member} size={26} />}
              <div className="stack" style={{ gap: '0.15rem', minWidth: 0 }}>
                <strong className="small">{name(r.memberId)}</strong>
                <div className="muted small">
                  {r.bringing.length > 0 && (
                    <span>🎒 {r.bringing.map((i) => i.name).join(', ')} </span>
                  )}
                  {r.going.length > 0 && <span>· ✅ {r.going.length} event(s) </span>}
                  {r.keenOn.length > 0 && <span>· 🎉 {r.keenOn.length} keen </span>}
                  {Math.abs(r.net) > 0.005 && (
                    <span style={{ color: r.net > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      · {r.net > 0 ? 'owed' : 'owes'} {formatMoney(Math.abs(r.net), currency)}
                    </span>
                  )}
                  {r.bringing.length === 0 &&
                    r.going.length === 0 &&
                    r.keenOn.length === 0 &&
                    Math.abs(r.net) <= 0.005 && <span>nothing yet</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
