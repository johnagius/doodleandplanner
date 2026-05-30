import { eventsForCountry, findMember } from '@dap/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { useToast } from '../../components/Toast.js';
import { capturePhoto } from '../../lib/capturePhoto.js';
import { useRoomStore } from '../../state/roomStore.js';
import { PhotoLightbox } from '../gallery/PhotoLightbox.js';
import { ChatPhoto } from './ChatPhoto.js';
import { MessageReactions } from './MessageReactions.js';

export function ChatPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const postMessage = useRoomStore((s) => s.postMessage);
  const addPhoto = useRoomStore((s) => s.addPhoto);
  const { show } = useToast();
  const messages = state.messages ?? [];
  const photos = state.photos ?? [];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const openPhoto = photos.find((p) => p.id === openId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await postMessage(text);
    setText('');
  }

  async function attach(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const captured = await capturePhoto(file, true);
      const photoId = await addPhoto(captured);
      await postMessage(text.trim(), photoId);
      setText('');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not share photo');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
                  {m.text && <div className="chat-text">{m.text}</div>}
                  {m.photoId && (
                    <ChatPhoto
                      slug={state.room.slug}
                      photoId={m.photoId}
                      alt={m.text || 'Shared photo'}
                      onOpen={() => setOpenId(m.photoId!)}
                    />
                  )}
                  <MessageReactions message={m} meId={meId} />
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      <form className="row" onSubmit={submit} aria-label="Chat composer">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Share a photo"
          title="Share a photo"
        >
          {busy ? '📤' : '📷'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void attach(e.target.files?.[0])}
        />
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

      {openPhoto && (
        <PhotoLightbox
          slug={state.room.slug}
          photo={openPhoto}
          authorName={findMember(state.room, openPhoto.authorId)?.name ?? 'Someone'}
          eventSuggestions={eventsForCountry(photos, openPhoto.country ?? null)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
