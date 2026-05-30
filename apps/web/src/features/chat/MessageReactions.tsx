import { REACTION_EMOJI, type Message } from '@dap/shared';
import { useState } from 'react';
import { useRoomStore } from '../../state/roomStore.js';

/**
 * Emoji reactions under a chat message: existing reactions render as chips
 * (count + highlight when you've reacted), and a "+" opens a small picker.
 */
export function MessageReactions({ message, meId }: { message: Message; meId: string | null }) {
  const react = useRoomStore((s) => s.reactToMessage);
  const [picking, setPicking] = useState(false);

  const reactions = message.reactions ?? {};
  const entries = Object.entries(reactions).filter(([, ids]) => ids.length > 0);

  return (
    <div className="chat-reactions">
      {entries.map(([emoji, ids]) => {
        const mine = !!meId && ids.includes(meId);
        return (
          <button
            key={emoji}
            type="button"
            className={`reaction-chip ${mine ? 'mine' : ''}`}
            onClick={() => void react(message.id, emoji)}
            aria-pressed={mine}
            aria-label={`${emoji} ${ids.length}`}
            title={mine ? 'Remove your reaction' : 'React'}
          >
            <span aria-hidden>{emoji}</span> {ids.length}
          </button>
        );
      })}

      <div className="reaction-add-wrap">
        <button
          type="button"
          className="reaction-add"
          onClick={() => setPicking((v) => !v)}
          aria-label="Add reaction"
          aria-expanded={picking}
        >
          ＋
        </button>
        {picking && (
          <div className="reaction-picker" role="menu">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                className="reaction-option"
                onClick={() => {
                  void react(message.id, emoji);
                  setPicking(false);
                }}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
