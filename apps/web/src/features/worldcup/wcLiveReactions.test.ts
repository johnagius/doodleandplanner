import { describe, expect, it } from 'vitest';
import { WC_LIVE_REACTION_EMOJI, isLiveReaction, liveReaction } from './wcLiveReactions.js';

describe('wcLiveReactions', () => {
  it('builds a tagged reaction payload', () => {
    expect(liveReaction('g-A-1', '🔥', 1000)).toEqual({
      kind: 'wc-reaction',
      matchId: 'g-A-1',
      emoji: '🔥',
      at: 1000,
    });
  });

  it('accepts well-formed reactions and rejects anything else', () => {
    expect(isLiveReaction(liveReaction('m', '⚽'))).toBe(true);
    // A cursor frame from the doodle feature sharing the channel must not match.
    expect(isLiveReaction({ memberId: 'x', x: 1, y: 2, at: 3 })).toBe(false);
    expect(isLiveReaction({ kind: 'wc-reaction', matchId: 'm', emoji: '🔥' })).toBe(false); // no at
    expect(isLiveReaction({ kind: 'wc-reaction', matchId: 5, emoji: '🔥', at: 1 })).toBe(false);
    expect(isLiveReaction(null)).toBe(false);
    expect(isLiveReaction('🔥')).toBe(false);
  });

  it('offers a small, non-empty emoji palette', () => {
    expect(WC_LIVE_REACTION_EMOJI.length).toBeGreaterThan(0);
  });
});
