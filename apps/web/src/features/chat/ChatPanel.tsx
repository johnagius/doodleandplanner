import { findMember } from '@dap/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { useRoomStore } from '../../state/roomStore.js';

export function ChatPanel() {
  const state = useRoomStore((s) => s.state)!;
  const postMessage = useRoomStore((s) => s.postMessage);
  const messages = state.messages ?? [];
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await postMessage(text);
    setText('');
  }

  return (
    <div className="card stack" aria-label="Discussion" style={{ gap: '0.75rem' }}>
      <h3 className="card-title" style={{ margin: 0 }}>
        💬 Discussion
      </h3>

      {messages.length === 0 ? (
        <div className="empty">No messages yet. Say hi to the group! 👋</div>
      ) : (
        <div className="chat-log" data-testid="chat-log">
          {messages.map((m) => {
            const author = findMember(state.room, m.authorId);
            return (
              <div key={m.id} className="chat-msg">
                <Avatar
                  member={{ name: author?.name ?? '?', color: author?.color ?? '#888' }}
                  size={28}
                />
                <div className="chat-bubble">
                  <div className="row small muted" style={{ gap: 6 }}>
                    <strong>{author?.name ?? 'Someone'}</strong>
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString([], { timeStyle: 'short' })}
                    </span>
                  </div>
                  <div className="chat-text">{m.text}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      <form className="row" onSubmit={submit} aria-label="Chat composer">
        <input
          className="input grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the group…"
          aria-label="Message"
          maxLength={2000}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
