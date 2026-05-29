import { buildInviteUrl } from '@dap/shared';
import { useClipboard } from '../../lib/useClipboard.js';
import { useRoomStore } from '../../state/roomStore.js';

/** The origin + base path the app is served from, without a trailing slash. */
export function appOrigin(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}`;
}

export function ShareBar() {
  const state = useRoomStore((s) => s.state)!;
  const copy = useClipboard();

  const inviteUrl = buildInviteUrl(appOrigin(), {
    slug: state.room.slug,
    token: state.room.inviteToken,
  });

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
        <button className="btn btn-sm" onClick={() => copy(state.room.slug, 'Room code copied')}>
          Copy code
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => copy(inviteUrl, 'Invite link copied')}
        >
          Copy invite link
        </button>
      </div>
    </div>
  );
}
