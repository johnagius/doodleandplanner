import { buildInviteUrl } from '@dap/shared';
import { useState } from 'react';
import { Modal } from '../../components/Modal.js';
import { appOrigin } from '../../lib/appOrigin.js';
import { useClipboard } from '../../lib/useClipboard.js';
import { canNativeShare, useShare } from '../../lib/useShare.js';
import { useRoomStore } from '../../state/roomStore.js';

/**
 * "Invite friends" dialog: share the room via the OS share sheet, copy the
 * invite link, send an email, or reset the link to revoke old invites. The link
 * carries a per-room token so only people you invite can join an invite-only
 * room — no Google Contacts or account lookups required.
 */
export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useRoomStore((s) => s.state)!;
  const rotateInvite = useRoomStore((s) => s.rotateInvite);
  const copy = useClipboard();
  const share = useShare();
  const [resetting, setResetting] = useState(false);

  const room = state.room;
  const inviteUrl = buildInviteUrl(appOrigin(), {
    slug: room.slug,
    token: room.inviteToken,
  });

  const shareText = `Join "${room.name}" on Doodle & Planner — vote on times, plan together and more.`;
  const mailto =
    `mailto:?subject=${encodeURIComponent(`You're invited: ${room.name}`)}` +
    `&body=${encodeURIComponent(`${shareText}\n\nJoin here: ${inviteUrl}\n\n(Room code: ${room.slug})`)}`;

  async function resetLink() {
    setResetting(true);
    try {
      await rotateInvite();
    } finally {
      setResetting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite friends 🎉">
      <p className="muted" style={{ marginTop: 0 }}>
        Anyone with this link can join {room.settings.openJoin ? '' : 'this invite-only room'}.
        Share it however you like.
      </p>

      <div className="invite-link-row">
        <input className="input" readOnly value={inviteUrl} aria-label="Invite link" />
        <button className="btn btn-primary" onClick={() => copy(inviteUrl, 'Invite link copied')}>
          Copy
        </button>
      </div>

      <div className="invite-actions">
        <button
          className="btn btn-block"
          onClick={() => share({ title: room.name, text: shareText, url: inviteUrl })}
        >
          {canNativeShare() ? '📤 Share…' : '📤 Share / copy link'}
        </button>
        <a className="btn btn-block" href={mailto}>
          ✉️ Email invite
        </a>
      </div>

      <div className="invite-meta">
        <span className="badge badge-primary">code {room.slug}</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={resetLink}
          disabled={resetting}
          title="Generate a new link and invalidate the old one"
        >
          {resetting ? 'Resetting…' : 'Reset link'}
        </button>
      </div>
    </Modal>
  );
}
