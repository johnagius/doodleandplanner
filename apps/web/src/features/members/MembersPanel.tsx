import { buildInviteUrl } from '@dap/shared';
import { Avatar } from '../../components/Avatar.js';
import { downloadRoom } from '../../lib/roomFile.js';
import { useClipboard } from '../../lib/useClipboard.js';
import { useRoomStore } from '../../state/roomStore.js';
import { appOrigin } from '../room/ShareBar.js';
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

      <RoomSettingsCard />
    </div>
  );
}
