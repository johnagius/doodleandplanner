import { describe, expect, it } from 'vitest';
import { WC_SQUADS, findSquadPlayer } from '../src/squads.js';

describe('findSquadPlayer', () => {
  // Pick a real squad entry to anchor the tests to the committed data.
  const sample = WC_SQUADS.find((p) => p.name === 'Federico Valverde')!;

  it('resolves an exact name', () => {
    expect(findSquadPlayer('Federico Valverde')?.id).toBe(sample.id);
  });

  it('matches first-initial + surname (the feed often abbreviates)', () => {
    expect(findSquadPlayer('F. Valverde', 'URU')?.id).toBe(sample.id);
  });

  it('matches accent-insensitively', () => {
    // "José Giménez" should resolve from a plain-ASCII feed spelling.
    const gimenez = WC_SQUADS.find((p) => p.name === 'José Giménez')!;
    expect(findSquadPlayer('Jose Gimenez', 'URU')?.id).toBe(gimenez.id);
  });

  it('scopes to a nation when one is given', () => {
    // A wrong nation should not match even a correct name.
    expect(findSquadPlayer('Federico Valverde', 'BRA')).toBeNull();
  });

  it('returns null for unknown players and empty input', () => {
    expect(findSquadPlayer('Nobody McNobody')).toBeNull();
    expect(findSquadPlayer('')).toBeNull();
    expect(findSquadPlayer('  ')).toBeNull();
  });
});
