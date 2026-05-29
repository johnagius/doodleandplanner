import { describe, expect, it } from 'vitest';
import {
  buildInvitePath,
  buildInviteUrl,
  parseInviteToken,
  verifyInvite,
} from '../src/invite.js';

describe('invite links', () => {
  it('builds an in-app path', () => {
    expect(buildInvitePath({ slug: 'k7m2qp', token: 'abc' })).toBe('/r/k7m2qp?invite=abc');
  });

  it('encodes special characters', () => {
    const path = buildInvitePath({ slug: 'a b', token: 'x/y+z' });
    expect(path).toContain('a%20b');
    expect(path).toContain('x%2Fy%2Bz');
  });

  it('builds a full url and strips a trailing slash from origin', () => {
    expect(buildInviteUrl('https://app.example.com/', { slug: 's', token: 't' })).toBe(
      'https://app.example.com/r/s?invite=t',
    );
  });

  it('parses the invite token from a query string', () => {
    expect(parseInviteToken('?invite=tok123&x=1')).toBe('tok123');
    expect(parseInviteToken(new URLSearchParams('invite=tok123'))).toBe('tok123');
    expect(parseInviteToken('?x=1')).toBeUndefined();
  });

  it('verifies tokens with constant-time compare', () => {
    const room = { inviteToken: 'super-secret-token' };
    expect(verifyInvite(room, 'super-secret-token')).toBe(true);
    expect(verifyInvite(room, 'wrong')).toBe(false);
    expect(verifyInvite(room, undefined)).toBe(false);
  });
});
