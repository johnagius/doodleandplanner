import { describe, expect, it } from 'vitest';
import { banterChips, commentSnippet, emptyPrompt, mentionSegments, mentions } from './wcBanter.js';

describe('wcBanter', () => {
  it('offers a non-empty set of chips for every phase', () => {
    for (const phase of ['pre', 'live', 'ft'] as const) {
      expect(banterChips(phase).length).toBeGreaterThan(0);
    }
    // The sets differ so banter stays contextual.
    expect(banterChips('pre')).not.toEqual(banterChips('live'));
    expect(banterChips('live')).not.toEqual(banterChips('ft'));
  });

  it('truncates long comments and collapses whitespace, leaving short ones', () => {
    expect(commentSnippet('Easy money')).toBe('Easy money');
    expect(commentSnippet('a  b\n c')).toBe('a b c');
    const long = 'x'.repeat(80);
    const snip = commentSnippet(long, 42);
    expect(snip).toHaveLength(42);
    expect(snip.endsWith('…')).toBe(true);
  });

  it('gives a different prompt per phase', () => {
    expect(emptyPrompt('pre')).not.toBe(emptyPrompt('live'));
    expect(emptyPrompt('ft')).not.toBe(emptyPrompt('pre'));
    expect(emptyPrompt('live')).toMatch(/\S/);
  });

  it('splits text into mention and plain segments', () => {
    const seg = mentionSegments('lol @John get in', ['John', 'Bo']);
    expect(seg).toEqual([
      { text: 'lol ', mention: false },
      { text: '@John', mention: true },
      { text: ' get in', mention: false },
    ]);
  });

  it('matches mentions case-insensitively but only a whole name with @', () => {
    expect(mentions('nice one @bo', 'Bo')).toBe(true);
    expect(mentions('Bonjour', 'Bo')).toBe(false); // no @, and not a whole-word match
    expect(mentions('@Johnny', 'John')).toBe(false); // @John must end on a boundary
    expect(mentions('plain text', 'John')).toBe(false);
  });
});
