import { describe, expect, it } from 'vitest';
import { banterChips, commentSnippet, emptyPrompt } from './wcBanter.js';

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
});
