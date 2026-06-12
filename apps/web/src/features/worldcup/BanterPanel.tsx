import { REACTION_EMOJI, type Message } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';

/** A lightweight squad chat for the predictions board — reuses the pure chat
 * helpers (and chat CSS), authored by the selected predictor. */
export function BanterPanel() {
  const messages = useWorldCupStore((s) => s.state?.messages ?? []);
  const predictors = useWorldCupStore((s) => s.state?.worldCup?.predictors ?? []);
  const meId = useWorldCupStore((s) => s.meId);
  const { postBanter, reactBanter, deleteBanter } = useWorldCupStore();
  const { show } = useToast();
  const [text, setText] = useState('');

  const nameOf = (id: string) => predictors.find((p) => p.id === id)?.name ?? 'Someone';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !meId) return;
    await postBanter(trimmed);
    const err = useWorldCupStore.getState().error;
    if (err) show(err);
    else setText('');
  }

  return (
    <div className="stack">
      {!meId && <div className="banner">Pick your name above to join the banter.</div>}
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="muted small">No banter yet — say something. 🗣️</p>
        ) : (
          messages.map((m) => (
            <BanterMessage
              key={m.id}
              message={m}
              name={nameOf(m.authorId)}
              meId={meId}
              onReact={(emoji) => {
                if (meId) void reactBanter(m.id, emoji);
              }}
              onDelete={() => void deleteBanter(m.id)}
            />
          ))
        )}
      </div>
      <form className="row" onSubmit={submit} style={{ gap: '0.4rem' }}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={meId ? 'Talk some trash…' : 'Pick your name to chat'}
          aria-label="Banter message"
          maxLength={2000}
          disabled={!meId}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || !meId}>
          Send
        </button>
      </form>
    </div>
  );
}

function BanterMessage({
  message,
  name,
  meId,
  onReact,
  onDelete,
}: {
  message: Message;
  name: string;
  meId: string | null;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const mine = !!meId && message.authorId === meId;
  const reactions = Object.entries(message.reactions ?? {});

  return (
    <div className="chat-msg">
      <div className="chat-bubble">
        <div className="row spread" style={{ gap: '0.5rem' }}>
          <strong className="small">{name}</strong>
          {mine && (
            <button className="chat-msg-action" onClick={onDelete} aria-label="Delete message">
              🗑️
            </button>
          )}
        </div>
        <div className="chat-text">{message.text}</div>
        <div className="chat-reactions">
          {reactions.map(([emoji, who]) => (
            <button
              key={emoji}
              className={`reaction-chip ${meId && who.includes(meId) ? 'mine' : ''}`}
              onClick={() => onReact(emoji)}
              disabled={!meId}
            >
              {emoji} {who.length}
            </button>
          ))}
          {meId && (
            <span className="reaction-add-wrap">
              <button
                className="reaction-add"
                aria-expanded={picker}
                aria-label="Add reaction"
                onClick={() => setPicker((v) => !v)}
              >
                ＋
              </button>
              {picker && (
                <span className="reaction-picker">
                  {REACTION_EMOJI.map((e) => (
                    <button
                      key={e}
                      className="reaction-option"
                      onClick={() => {
                        onReact(e);
                        setPicker(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
