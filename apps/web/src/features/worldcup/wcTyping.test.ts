import { describe, expect, it } from 'vitest';
import { isTyping, typingLabel, typingPing } from './wcTyping.js';

describe('wcTyping', () => {
  it('builds a tagged typing ping', () => {
    expect(typingPing('g-A-1', 'Ada', 1000)).toEqual({
      kind: 'wc-typing',
      matchId: 'g-A-1',
      name: 'Ada',
      at: 1000,
    });
  });

  it('accepts well-formed pings and rejects anything else', () => {
    expect(isTyping(typingPing('m', 'Ada'))).toBe(true);
    expect(isTyping({ kind: 'wc-reaction', matchId: 'm', emoji: '🔥', at: 1 })).toBe(false);
    expect(isTyping({ kind: 'wc-typing', matchId: 'm', name: 'Ada' })).toBe(false); // no at
    expect(isTyping(null)).toBe(false);
  });

  it('phrases the indicator for one, two and many typers', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Ada'])).toBe('Ada is typing…');
    expect(typingLabel(['Ada', 'Bo'])).toBe('Ada & Bo are typing…');
    expect(typingLabel(['Ada', 'Bo', 'Cy'])).toBe('3 people are typing…');
  });
});
