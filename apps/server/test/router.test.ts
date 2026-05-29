import { describe, expect, it } from 'vitest';
import { corsHeaders, json, route } from '../src/router.js';

describe('route', () => {
  it('routes room CRUD paths', () => {
    expect(route('POST', '/api/rooms')).toEqual({ kind: 'create' });
    expect(route('GET', '/api/rooms/abc123')).toEqual({ kind: 'get', slug: 'abc123' });
    expect(route('PUT', '/api/rooms/abc123')).toEqual({ kind: 'save', slug: 'abc123' });
    expect(route('GET', '/api/rooms/abc123/ws')).toEqual({ kind: 'ws', slug: 'abc123' });
  });

  it('handles preflight, health and trailing slashes', () => {
    expect(route('OPTIONS', '/api/rooms/abc')).toEqual({ kind: 'preflight' });
    expect(route('GET', '/api/health')).toEqual({ kind: 'health' });
    expect(route('GET', '/api/rooms/abc/')).toEqual({ kind: 'get', slug: 'abc' });
  });

  it('decodes slugs and rejects unknown or wrong-method paths', () => {
    expect(route('GET', '/api/rooms/a%20b')).toEqual({ kind: 'get', slug: 'a b' });
    expect(route('GET', '/api/rooms')).toEqual({ kind: 'not-found' });
    expect(route('DELETE', '/api/rooms/abc')).toEqual({ kind: 'not-found' });
    expect(route('GET', '/nope')).toEqual({ kind: 'not-found' });
    expect(route('GET', '/api/rooms/abc/extra')).toEqual({ kind: 'not-found' });
  });
});

describe('corsHeaders', () => {
  it('echoes any origin when wildcard is configured', () => {
    const h = corsHeaders('https://x.example', '*');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('allows a listed origin and falls back otherwise', () => {
    const allowed = 'https://a.com, https://b.com';
    expect(corsHeaders('https://b.com', allowed)['Access-Control-Allow-Origin']).toBe(
      'https://b.com',
    );
    expect(corsHeaders('https://evil.com', allowed)['Access-Control-Allow-Origin']).toBe(
      'https://a.com',
    );
  });
});

describe('json', () => {
  it('serialises with a JSON content-type and merges headers', async () => {
    const res = json({ a: 1 }, { status: 201 }, { 'X-Test': 'yes' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('X-Test')).toBe('yes');
    expect(await res.json()).toEqual({ a: 1 });
  });
});
