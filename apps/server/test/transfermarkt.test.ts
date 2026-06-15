import { describe, expect, it } from 'vitest';
import { parseTmValueM } from '../src/transfermarkt.js';
import { route } from '../src/router.js';

describe('parseTmValueM', () => {
  it('returns the first usable market value in millions', () => {
    expect(parseTmValueM({ results: [{ name: 'Achraf Hakimi', marketValue: 80000000 }] })).toBe(80);
    expect(parseTmValueM({ results: [{ marketValue: 1500000 }] })).toBe(1.5);
    expect(parseTmValueM({ results: [{ marketValue: 120000000 }] })).toBe(120); // rounded to int ≥ €100M
  });

  it('skips null/zero values and handles empty/garbage', () => {
    expect(parseTmValueM({ results: [{ marketValue: null }, { marketValue: 12000000 }] })).toBe(12);
    expect(parseTmValueM({ results: [{ marketValue: 0 }] })).toBeNull();
    expect(parseTmValueM({ results: [] })).toBeNull();
    expect(parseTmValueM(null)).toBeNull();
    expect(parseTmValueM({})).toBeNull();
  });
});

describe('route: values endpoint', () => {
  it('routes GET /api/football/values', () => {
    expect(route('GET', '/api/football/values')).toEqual({ kind: 'wc-values' });
    expect(route('POST', '/api/football/values')).toEqual({ kind: 'not-found' });
  });
});
