import { REACTION_EMOJI, type Message } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import { banterChips, commentSnippet, emptyPrompt, type WcMatchPhase } from './wcBanter.js';

/** A collapsible per-match comment thread — banter right in the hot zone, under
 * each match card. Reuses the pure chat helpers (and chat CSS), authored by the
 * selected predictor. Collapsed by default but previews the latest comment (or a
 * phase-aware prompt) so it's never a silent, empty box, and offers one-tap
 * banter chips so joining in needs no typing. */
export function MatchComments({ matchId, phase }: { matchId: string; phase: WcMatchPhase }) {
  const messages = useWorldCupStore((s) => s.state?.messages);
  const predictors = useWorldCupStore((s) => s.state?.worldCup?.predictors ?? []);
  const meId = useWorldCupStore((s) => s.meId);
  const { postComment, reactComment, deleteComment } = useWorldCupStore();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const thread = (messages ?? []).filter((m) => m.matchId === matchId);
  const predictorOf = (id: string) => predictors.find((p) => p.id === id) ?? null;
  const last = thread[thread.length - 1];

  async function post(body: string) {
    const trimmed = body.trim();
    if (!trimmed || !meId) return;
    await postComment(matchId, trimmed);
    const err = useWorldCupStore.getState().error;
    if (err) show(err);
    else setText('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await post(text);
  }

  return (
    <div className="wc-comments">
      <button
        type="button"
        className="wc-comments-toggle"
        aria-expanded={open}
        aria-label={`Banter${thread.length ? `, ${thread.length} comment${thread.length === 1 ? '' : 's'}` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        💬{' '}
        {last ? (
          <span className="wc-comments-preview">
            <strong>{predictorOf(last.authorId)?.name ?? 'Someone'}:</strong>{' '}
            {commentSnippet(last.text)} · {thread.length}
          </span>
        ) : (
          <span className="wc-comments-preview muted">{emptyPrompt(phase)}</span>
        )}
      </button>

      {open && (
        <div className="stack wc-comments-body">
          {!meId && <div className="banner">Pick your name above to join the banter.</div>}
          {thread.length > 0 && (
            <div className="chat-log">
              {thread.map((m) => (
                <CommentMessage
                  key={m.id}
                  message={m}
                  predictor={predictorOf(m.authorId)}
                  meId={meId}
                  onReact={(emoji) => {
                    if (meId) void reactComment(m.id, emoji);
                  }}
                  onDelete={() => void deleteComment(m.id)}
                />
              ))}
            </div>
          )}
          {meId && (
            <div className="wc-banter-chips">
              {banterChips(phase).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="wc-banter-chip"
                  onClick={() => void post(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <form className="row" onSubmit={submit} style={{ gap: '0.4rem' }}>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={meId ? 'Or type your own…' : 'Pick your name to chat'}
              aria-label="Match comment"
              maxLength={2000}
              disabled={!meId}
            />
            <button
              className="btn btn-sm btn-primary"
              type="submit"
              disabled={!text.trim() || !meId}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CommentMessage({
  message,
  predictor,
  meId,
  onReact,
  onDelete,
}: {
  message: Message;
  predictor: { name: string; avatarPhotoId?: string } | null;
  meId: string | null;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const mine = !!meId && message.authorId === meId;
  const reactions = Object.entries(message.reactions ?? {});
  const name = predictor?.name ?? 'Someone';

  return (
    <div className="chat-msg">
      <Avatar predictor={predictor} size={40} />
      <div className="chat-bubble">
        <div className="row spread" style={{ gap: '0.5rem' }}>
          <strong className="small">{name}</strong>
          {mine && (
            <button className="chat-msg-action" onClick={onDelete} aria-label="Delete comment">
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
