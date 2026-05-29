/** Invite-link construction and verification. */
import { safeEqual } from './ids.js';
import type { Room } from './types.js';

export interface InviteLinkParts {
  slug: string;
  token: string;
}

/**
 * Build the in-app path for an invite. We use hash-free paths and rely on the
 * router; the token travels as a query param so it can be revoked by rotating
 * `room.inviteToken` without changing the room URL.
 */
export function buildInvitePath({ slug, token }: InviteLinkParts): string {
  return `/r/${encodeURIComponent(slug)}?invite=${encodeURIComponent(token)}`;
}

/** Build a full shareable URL given an app origin/base. */
export function buildInviteUrl(origin: string, parts: InviteLinkParts): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${buildInvitePath(parts)}`;
}

/** Parse an invite token out of a query string or URLSearchParams. */
export function parseInviteToken(search: string | URLSearchParams): string | undefined {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('invite') ?? undefined;
}

/** Does the supplied token grant access to the room? Constant-time compare. */
export function verifyInvite(room: Pick<Room, 'inviteToken'>, token: string | undefined): boolean {
  if (!token) return false;
  return safeEqual(room.inviteToken, token);
}
