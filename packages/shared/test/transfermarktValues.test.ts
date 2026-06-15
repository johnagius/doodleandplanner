import { describe, expect, it } from 'vitest';
import { marketValueM, normalizePlayerName, valueDbSize } from '../src/transfermarktValues.js';

describe('normalizePlayerName', () => {
  it('strips diacritics, case and punctuation so feed spellings collapse together', () => {
    expect(normalizePlayerName('Vinícius Júnior')).toBe('vinicius junior');
    expect(normalizePlayerName('VINICIUS JUNIOR')).toBe('vinicius junior');
    expect(normalizePlayerName("N'Golo Kanté")).toBe('ngolo kante');
    expect(normalizePlayerName('Trent Alexander-Arnold')).toBe('trent alexander arnold');
    expect(normalizePlayerName('  Pau   Cubarsí  ')).toBe('pau cubarsi');
  });
});

describe('marketValueM', () => {
  it('returns the static value regardless of how the name is spelled', () => {
    expect(marketValueM('Lamine Yamal')).toBe(200);
    // Diacritic-insensitive: an ASCII feed name still matches the accented key.
    expect(marketValueM('Vinicius Junior')).toBe(marketValueM('Vinícius Júnior'));
    expect(marketValueM('vinícius júnior')).toBeGreaterThan(0);
  });

  it('returns null for an unknown name so callers can fall back to the live API', () => {
    expect(marketValueM('Some Unknown Reserve')).toBeNull();
    expect(marketValueM('')).toBeNull();
  });

  it('covers a broad set of World Cup players', () => {
    expect(valueDbSize()).toBeGreaterThan(150);
  });
});
