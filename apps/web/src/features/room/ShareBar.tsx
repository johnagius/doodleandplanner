import { buildInviteUrl } from '@dap/shared';
import { useState } from 'react';
import { appOrigin } from '../../lib/appOrigin.js';
import { useShare } from '../../lib/useShare.js';
import { useRoomStore } from '../../state/roomStore.js';
import { InviteModal } from './InviteModal.js';

export function ShareBar() {
  const state = useRoomStore((s) => s.state)!;
  const share = useShare();
  const [inviteOpen, setInviteOpen] = useState(false);

  const inviteUrl = buildInviteUrl(appOrigin(), {
    slug: state.room.slug,
    token: state.room.inviteToken,
  });
  const shareText = `Join "${state.room.name}" on Doodle & Planner.`;

  return (
    <div className="card row spread row-wrap" style={{ padding: '0.75rem 1rem', gap: '0.75rem' }}>
      <div className="row" style={{ gap: '0.75rem', minWidth: 0 }}>
        <span className="badge badge-primary">code {state.room.slug}</span>
        {state.room.passwordHash && <span className="badge badge-warn">🔒 password</span>}
        <code
          className="muted small"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 360,
          }}
        >
          {inviteUrl}
        </code>
      </div>
      <div className="row">
        <button
          className="btn btn-sm"
          onClick={() => share({ title: state.room.name, text: shareText, url: inviteUrl })}
        >
          📤 Share
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setInviteOpen(true)}>
          Invite friends
        </button>
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
