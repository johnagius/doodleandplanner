/**
 * Server-side email↔predictor bindings, one-time codes, and session minting for
 * the World Cup board. Decoupled from Durable Object storage via the same
 * {@link KvLike} interface as RoomService, so it unit-tests with an in-memory map.
 *
 * Email-frugal by design (the owner's send quota is precious):
 *  - a verified browser keeps a long-lived session token, so it never re-emails;
 *  - rapid repeat requests within {@link RESEND_GAP_MS} reuse the live code
 *    instead of sending another; and
 *  - the web client never even calls `requestCode` while it holds a valid token.
 */
import {
  createSessionToken,
  isValidEmail,
  normalizeEmail,
  randomOtp,
  sha256Hex,
} from '@dap/shared';
import type { KvLike } from './roomService.js';

const AUTH_KEY = 'wc-auth';
const CODE_TTL_MS = 10 * 60_000; // a code is valid for 10 minutes
const RESEND_GAP_MS = 90_000; // within 90s, reuse the code (don't spend another email)
const SESSION_TTL_MS = 365 * 24 * 60 * 60_000; // "remember the browser" ~1 year
const MAX_VERIFY_ATTEMPTS = 6;

interface Binding {
  email: string;
  claimedAt: string;
}
interface Otp {
  codeHash: string;
  email: string;
  exp: number;
  sentAt: number;
  attempts: number;
}
interface AuthData {
  bindings: Record<string, Binding>;
  otps: Record<string, Otp>;
}

export interface AuthResult {
  status: number;
  body: Record<string, unknown>;
  /** Set when a verify call claimed a name for the first time (caller re-stamps). */
  claimedChanged?: boolean;
}

/** Sends a code to an address; injected so tests don't hit the network. */
export type SendCode = (to: string, code: string) => Promise<void>;

export class WcAuthService {
  constructor(
    private readonly kv: KvLike,
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async read(): Promise<AuthData> {
    const raw = await this.kv.get(AUTH_KEY);
    if (!raw) return { bindings: {}, otps: {} };
    try {
      const d = JSON.parse(raw) as Partial<AuthData>;
      return { bindings: d.bindings ?? {}, otps: d.otps ?? {} };
    } catch {
      return { bindings: {}, otps: {} };
    }
  }

  private async write(d: AuthData): Promise<void> {
    await this.kv.put(AUTH_KEY, JSON.stringify(d));
  }

  /** The predictor ids that have a verified email (i.e. are locked to an owner). */
  async claimedIds(): Promise<Set<string>> {
    return new Set(Object.keys((await this.read()).bindings));
  }

  private codeHash(code: string, predictorId: string): Promise<string> {
    return sha256Hex(`${code}:${predictorId}:${this.secret}`);
  }

  /**
   * Issue a login code for a name and email it — unless a fresh code was just
   * sent (then reuse it, spending no email), or the name is already bound to a
   * different email (then refuse: it's taken).
   */
  async requestCode(predictorId: string, emailRaw: string, send: SendCode): Promise<AuthResult> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) return { status: 400, body: { error: 'invalid-email' } };
    const data = await this.read();
    const bound = data.bindings[predictorId];
    if (bound && bound.email !== email) {
      return { status: 409, body: { error: 'name-taken' } };
    }
    const now = this.now();
    const live = data.otps[predictorId];
    if (live && live.email === email && live.exp > now && now - live.sentAt < RESEND_GAP_MS) {
      return { status: 200, body: { ok: true, emailed: false } }; // de-dupe rapid taps
    }
    const code = randomOtp();
    // Send before persisting: if the provider fails, nothing is stored, so the
    // next tap retries cleanly instead of being throttled by the resend gap. (A
    // Durable Object serialises its requests, so there's no double-send race.)
    await send(email, code); // the only place an email is spent
    data.otps[predictorId] = {
      codeHash: await this.codeHash(code, predictorId),
      email,
      exp: now + CODE_TTL_MS,
      sentAt: now,
      attempts: 0,
    };
    await this.write(data);
    return { status: 200, body: { ok: true, emailed: true } };
  }

  /**
   * Check a code; on success bind the email to the name (first claim wins) and
   * return a long-lived session token so this browser won't be asked again.
   */
  async verifyCode(predictorId: string, code: string): Promise<AuthResult> {
    const data = await this.read();
    const otp = data.otps[predictorId];
    const now = this.now();
    if (!otp || otp.exp < now) return { status: 400, body: { error: 'no-code' } };
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) return { status: 429, body: { error: 'too-many' } };
    if ((await this.codeHash(code, predictorId)) !== otp.codeHash) {
      otp.attempts += 1;
      await this.write(data);
      return {
        status: 400,
        body: { error: 'wrong-code', left: MAX_VERIFY_ATTEMPTS - otp.attempts },
      };
    }
    const firstClaim = !data.bindings[predictorId];
    data.bindings[predictorId] = {
      email: otp.email,
      claimedAt: data.bindings[predictorId]?.claimedAt ?? new Date(now).toISOString(),
    };
    delete data.otps[predictorId];
    await this.write(data);
    const token = await createSessionToken(predictorId, SESSION_TTL_MS, this.secret, now);
    return { status: 200, body: { ok: true, token, predictorId }, claimedChanged: firstClaim };
  }

  /** Admin: drop a name's binding so it can be re-claimed (owner asked us to fix). */
  async release(predictorId: string): Promise<boolean> {
    const data = await this.read();
    const had = !!data.bindings[predictorId];
    delete data.bindings[predictorId];
    delete data.otps[predictorId];
    await this.write(data);
    return had;
  }
}
