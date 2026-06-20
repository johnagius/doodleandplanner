/**
 * Crowd reactions that fly across the big screen for everyone in the Room. Same
 * ephemeral presence channel as the fixture-card reactions (relayed by the
 * Worker, cross-tab via BroadcastChannel) — never persisted, no scoring impact.
 * Tapping floats your emoji across the screen for every watcher, with an opt-in
 * haptic.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepository } from '../../lib/storage/index.js';
import { vibrate } from './wcSound.js';
import { WC_LIVE_REACTION_EMOJI, isLiveReaction, liveReaction } from './wcLiveReactions.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';

interface Fly {
  id: string;
  emoji: string;
  /** Vertical lane across the screen, 6–82%. */
  y: number;
  /** 1 = left→right, -1 = right→left. */
  dir: 1 | -1;
}

const TTL_MS = 3600; // matches the CSS fly animation
const THROTTLE_MS = 180;

export function StageReactions({ matchId }: { matchId: string }) {
  const [flies, setFlies] = useState<Fly[]>([]);
  const lastSent = useRef(0);

  const push = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const y = 6 + Math.random() * 76;
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    setFlies((list) => [...list, { id, emoji, y, dir }].slice(-30));
    window.setTimeout(() => setFlies((list) => list.filter((f) => f.id !== id)), TTL_MS);
  }, []);

  useEffect(() => {
    const repo = getRepository();
    if (!repo.subscribePresence) return;
    return repo.subscribePresence(WORLD_CUP_SLUG, (payload) => {
      if (isLiveReaction(payload) && payload.matchId === matchId) push(payload.emoji);
    });
  }, [matchId, push]);

  const send = useCallback(
    (emoji: string) => {
      const now = Date.now();
      if (now - lastSent.current < THROTTLE_MS) return;
      lastSent.current = now;
      getRepository().publishPresence?.(WORLD_CUP_SLUG, liveReaction(matchId, emoji, now));
      push(emoji); // optimistic — the relay never echoes to the sender
      vibrate(15);
    },
    [matchId, push],
  );

  return (
    <>
      <div className="wc-stage-react-layer" aria-hidden>
        {flies.map((f) => (
          <span
            key={f.id}
            className={`wc-stage-fly ${f.dir === 1 ? 'to-right' : 'to-left'}`}
            style={{ top: `${f.y}%` }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
      <div className="wc-stage-react-bar" role="group" aria-label="Send a reaction to the room">
        {WC_LIVE_REACTION_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            className="wc-stage-react-btn"
            onClick={() => send(e)}
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
