import { findMember, type Message, type Room } from '@dap/shared';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { useRoomStore } from '../../state/roomStore.js';
import { ChatPhoto } from './ChatPhoto.js';
import { MessageReactions } from './MessageReactions.js';

/** A single chat message: header, text/photo, reactions, and author edit/delete. */
export function ChatMessage({
  message,
  room,
  meId,
  onOpenPhoto,
}: {
  message: Message;
  room: Room;
  meId: string | null;
  onOpenPhoto: (photoId: string) => void;
}) {
  const editMessage = useRoomStore((s) => s.editMessage);
  const deleteMessage = useRoomStore((s) => s.deleteMessage);
  const author = findMember(room, message.authorId);
  const mine = !!meId && message.authorId === meId;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);

  async function saveEdit() {
    const next = draft.trim();
    if (next && next !== message.text) await editMessage(message.id, next);
    setEditing(false);
  }

  return (
    <div className="chat-msg">
      <Avatar member={{ name: author?.name ?? '?', color: author?.color ?? '#888' }} size={28} />
      <div className="chat-bubble">
        <div className="row small muted" style={{ gap: 6 }}>
          <strong>{author?.name ?? 'Someone'}</strong>
          <span>{new Date(message.createdAt).toLocaleTimeString([], { timeStyle: 'short' })}</span>
          {message.editedAt && <span title="Edited">· edited</span>}
          {mine && !editing && (
            <span className="chat-msg-actions">
              {message.text && (
                <button
                  type="button"
                  className="chat-msg-action"
                  onClick={() => {
                    setDraft(message.text);
                    setEditing(true);
                  }}
                  aria-label="Edit message"
                >
                  ✎
                </button>
              )}
              <button
                type="button"
                className="chat-msg-action"
                onClick={() => {
                  if (confirm('Delete this message?')) void deleteMessage(message.id);
                }}
                aria-label="Delete message"
              >
                🗑
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <div className="row" style={{ gap: '0.3rem', marginTop: '0.25rem' }}>
            <input
              className="input grow"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label="Edit message text"
            />
            <button className="btn btn-sm btn-primary" onClick={() => void saveEdit()}>
              Save
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          message.text && <div className="chat-text">{message.text}</div>
        )}

        {message.photoId && (
          <ChatPhoto
            slug={room.slug}
            photoId={message.photoId}
            alt={message.text || 'Shared photo'}
            onOpen={() => onOpenPhoto(message.photoId!)}
          />
        )}
        <MessageReactions message={message} meId={meId} />
      </div>
    </div>
  );
}
