import { REACTION_EMOJI, banterPrompt, type Message } from '@dap/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { getRepository } from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import {
  banterChips,
  commentSnippet,
  emptyPrompt,
  mentionSegments,
  type WcMatchPhase,
} from './wcBanter.js';
import { WC_GIF_CATEGORIES, gifUrl } from './wcGifs.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';
import { isTyping, typingLabel, typingPing } from './wcTyping.js';

const TYPING_TTL_MS = 4000;
const TYPING_PING_THROTTLE_MS = 1500;

/** Ephemeral "is typing…" presence for one match's thread: returns who's typing
 * (excluding me) and a throttled notifier to call as I type. */
function useTyping(matchId: string, meName: string | null) {
  const [typers, setTypers] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastPing = useRef(0);

  useEffect(() => {
    const repo = getRepository();
    if (!repo.subscribePresence) return;
    const unsub = repo.subscribePresence(WORLD_CUP_SLUG, (payload) => {
      if (!isTyping(payload) || payload.matchId !== matchId) return;
      if (payload.name === meName) return; // never show my own
      const name = payload.name;
      setTypers((cur) => (cur.includes(name) ? cur : [...cur, name]));
      clearTimeout(timers.current.get(name));
      timers.current.set(
        name,
        setTimeout(() => {
          timers.current.delete(name);
          setTypers((cur) => cur.filter((n) => n !== name));
        }, TYPING_TTL_MS),
      );
    });
    const pending = timers.current;
    return () => {
      unsub?.();
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, [matchId, meName]);

  const notifyTyping = useCallback(() => {
    if (!meName) return;
    const now = Date.now();
    if (now - lastPing.current < TYPING_PING_THROTTLE_MS) return;
    lastPing.current = now;
    getRepository().publishPresence?.(WORLD_CUP_SLUG, typingPing(matchId, meName, now));
  }, [matchId, meName]);

  return { typers, notifyTyping };
}

/** A collapsible per-match comment thread — banter right in the hot zone, under
 * each match card. Reuses the pure chat helpers (and chat CSS), authored by the
 * selected predictor. Collapsed by default but previews the latest comment (or a
 * phase-aware prompt) so it's never a silent, empty box, and offers one-tap
 * banter chips so joining in needs no typing. */
export function MatchComments({ matchId, phase }: { matchId: string; phase: WcMatchPhase }) {
  const messages = useWorldCupStore((s) => s.state?.messages);
  const wc = useWorldCupStore((s) => s.state?.worldCup);
  const predictors = wc?.predictors ?? [];
  const meId = useWorldCupStore((s) => s.meId);
  const { postComment, postGif, reactComment, deleteComment } = useWorldCupStore();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [gifOpen, setGifOpen] = useState(false);
  const [gifCat, setGifCat] = useState(WC_GIF_CATEGORIES[0]!.key);
  const [brokenGifs, setBrokenGifs] = useState<Set<string>>(() => new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeGifs = (WC_GIF_CATEGORIES.find((c) => c.key === gifCat) ?? WC_GIF_CATEGORIES[0]!)
    .gifs;

  const thread = (messages ?? []).filter((m) => m.matchId === matchId);
  const predictorOf = (id: string) => predictors.find((p) => p.id === id) ?? null;
  const last = thread[thread.length - 1];
  const meName = (meId && predictorOf(meId)?.name) || null;
  const { typers, notifyTyping } = useTyping(matchId, meName);
  const prompt = wc ? banterPrompt(wc, matchId) : null;

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

  async function sendGif(id: string) {
    if (!meId) return;
    await postGif(matchId, gifUrl(id));
    const err = useWorldCupStore.getState().error;
    if (err) show(err);
    else setGifOpen(false);
  }

  const others = predictors.filter((p) => p.id !== meId);
  function insertMention(name: string) {
    setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `);
    setMentionOpen(false);
    inputRef.current?.focus();
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
        {typers.length > 0 ? (
          <span className="wc-comments-preview wc-typing">✍️ {typingLabel(typers)}</span>
        ) : last ? (
          <span className="wc-comments-preview">
            <strong>{predictorOf(last.authorId)?.name ?? 'Someone'}:</strong>{' '}
            {last.gifUrl ? <PreviewGif url={last.gifUrl} /> : commentSnippet(last.text)} ·{' '}
            {thread.length}
          </span>
        ) : (
          <span className="wc-comments-preview muted">{prompt ?? emptyPrompt(phase)}</span>
        )}
      </button>

      {open && (
        <div className="stack wc-comments-body">
          {prompt && <div className="wc-banter-prompt">💬 {prompt}</div>}
          {!meId && <div className="banner">Pick your name above to join the banter.</div>}
          {thread.length > 0 && (
            <div className="chat-log">
              {thread.map((m) => (
                <CommentMessage
                  key={m.id}
                  message={m}
                  predictor={predictorOf(m.authorId)}
                  meId={meId}
                  names={predictors.map((p) => p.name)}
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
              <button
                type="button"
                className={`wc-banter-chip ${gifOpen ? 'is-active' : ''}`}
                aria-expanded={gifOpen}
                onClick={() => setGifOpen((v) => !v)}
              >
                🎞 GIF
              </button>
              {others.length > 0 && (
                <button
                  type="button"
                  className={`wc-banter-chip ${mentionOpen ? 'is-active' : ''}`}
                  aria-expanded={mentionOpen}
                  onClick={() => setMentionOpen((v) => !v)}
                >
                  @ Mention
                </button>
              )}
            </div>
          )}
          {meId && mentionOpen && others.length > 0 && (
            <div className="wc-banter-chips wc-mention-row">
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="wc-banter-chip"
                  onClick={() => insertMention(p.name)}
                >
                  @{p.name}
                </button>
              ))}
            </div>
          )}
          {meId && gifOpen && (
            <div className="wc-gif-picker">
              <div className="wc-gif-cats">
                {WC_GIF_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`wc-gif-cat ${gifCat === c.key ? 'is-active' : ''}`}
                    onClick={() => setGifCat(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="wc-gif-grid">
                {activeGifs
                  .filter((g) => !brokenGifs.has(g.id))
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="wc-gif-thumb"
                      title={g.alt}
                      onClick={() => void sendGif(g.id)}
                    >
                      <img
                        src={gifUrl(g.id)}
                        alt={g.alt}
                        loading="lazy"
                        onError={() => setBrokenGifs((b) => new Set(b).add(g.id))}
                      />
                    </button>
                  ))}
              </div>
            </div>
          )}
          {typers.length > 0 && (
            <div className="wc-typing small muted">✍️ {typingLabel(typers)}</div>
          )}
          <form className="row" onSubmit={submit} style={{ gap: '0.4rem' }}>
            <input
              ref={inputRef}
              className="input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                notifyTyping();
              }}
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

/** A tiny inline GIF thumbnail for the collapsed bar, so people can see at a
 * glance that banter has GIFs. Falls back to a text label if it won't load. */
function PreviewGif({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <>🎞 GIF</>;
  return (
    <img
      className="wc-comments-preview-gif"
      src={url}
      alt="GIF"
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}

function CommentMessage({
  message,
  predictor,
  meId,
  names,
  onReact,
  onDelete,
}: {
  message: Message;
  predictor: { name: string; avatarPhotoId?: string } | null;
  meId: string | null;
  names: string[];
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
        {message.text && (
          <div className="chat-text">
            {mentionSegments(message.text, names).map((s, i) =>
              s.mention ? (
                <span key={i} className="wc-mention">
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </div>
        )}
        {message.gifUrl && (
          <img
            className="wc-comment-gif"
            src={message.gifUrl}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
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
