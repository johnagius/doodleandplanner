import { readSessionToken } from '@dap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { KvLike } from '../src/roomService.js';
import { WcAuthService } from '../src/wcAuthService.js';

function memoryKv(): KvLike {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => void map.set(k, v),
  };
}

const SECRET = 'test-secret';

describe('WcAuthService', () => {
  let kv: KvLike;
  let now: number;
  let svc: WcAuthService;
  let sent: { to: string; code: string }[];
  const send = async (to: string, code: string) => void sent.push({ to, code });

  beforeEach(() => {
    kv = memoryKv();
    now = 1_000_000_000;
    sent = [];
    svc = new WcAuthService(kv, SECRET, () => now);
  });

  it('rejects an invalid email and sends nothing', async () => {
    const r = await svc.requestCode('john', 'not-an-email', send);
    expect(r.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('emails a code, then reuses it on rapid repeat (no second email)', async () => {
    const first = await svc.requestCode('john', 'John@x.com', send);
    expect(first.body).toMatchObject({ emailed: true });
    expect(sent).toHaveLength(1);
    // Tap again 10s later → same code reused, no email spent.
    now += 10_000;
    const again = await svc.requestCode('john', 'john@x.com', send);
    expect(again.body).toMatchObject({ emailed: false });
    expect(sent).toHaveLength(1);
    // After the resend gap, a new email is allowed.
    now += 120_000;
    await svc.requestCode('john', 'john@x.com', send);
    expect(sent).toHaveLength(2);
  });

  it('verifies the right code, binds the email, mints a session, and claims the name', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    const code = sent[0]!.code;
    const r = await svc.verifyCode('john', code);
    expect(r.status).toBe(200);
    expect(r.claimedChanged).toBe(true);
    expect(await svc.claimedIds()).toEqual(new Set(['john']));
    // The token is a valid session for John.
    expect(await readSessionToken(String(r.body.token), SECRET, now)).toBe('john');
  });

  it('rejects a wrong code and counts down attempts', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    const bad = await svc.verifyCode('john', '000000');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('wrong-code');
    expect(await svc.claimedIds()).toEqual(new Set()); // not claimed on failure
  });

  it('expires codes', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    const code = sent[0]!.code;
    now += 11 * 60_000; // past the 10-minute TTL
    expect((await svc.verifyCode('john', code)).status).toBe(400);
  });

  it('refuses to send a code for a name already bound to a different email', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    await svc.verifyCode('john', sent[0]!.code);
    const taken = await svc.requestCode('john', 'someone-else@x.com', send);
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('name-taken');
    expect(sent).toHaveLength(1); // no email spent on the rejected claim
  });

  it('lets the bound owner re-verify from a new device (same email)', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    await svc.verifyCode('john', sent[0]!.code);
    now += 200_000;
    const again = await svc.requestCode('john', 'john@x.com', send);
    expect(again.body).toMatchObject({ emailed: true });
    expect((await svc.verifyCode('john', sent[1]!.code)).status).toBe(200);
  });

  it('release() drops a binding so the name can be re-claimed', async () => {
    await svc.requestCode('john', 'john@x.com', send);
    await svc.verifyCode('john', sent[0]!.code);
    expect(await svc.release('john')).toBe(true);
    expect(await svc.claimedIds()).toEqual(new Set());
    // A different email can now claim it.
    now += 200_000;
    const r = await svc.requestCode('john', 'new@x.com', send);
    expect(r.body).toMatchObject({ emailed: true });
  });
});
