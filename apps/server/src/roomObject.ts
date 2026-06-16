/**
 * One Durable Object instance per room. It owns the canonical RoomState and
 * fans every change out to all connected WebSocket clients in real time.
 */
import { authorizeWcWrite, readSessionToken, stampClaimed, type RoomState } from '@dap/shared';
import { emailConfigured, sendOtpEmail } from './brevo.js';
import { RoomConflictError, RoomService, isRoomState } from './roomService.js';
import { corsHeaders, isPresenceFrame, json, route } from './router.js';
import { WcAuthService } from './wcAuthService.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  /** football-data.org API token (Worker secret) for live World Cup scores. */
  FOOTBALL_DATA_TOKEN?: string;
  /** Brevo transactional-email key + verified sender, for World Cup login codes. */
  BREVO_API_KEY?: string;
  AUTH_SENDER?: string;
  AUTH_SENDER_NAME?: string;
  /** HMAC secret for signing session tokens. Auth is inert until this is set. */
  AUTH_SECRET?: string;
  /** Bearer token (sent as X-WC-Admin) that authorises releasing a name's email. */
  WC_ADMIN_TOKEN?: string;
}

/** Minimal SQLite surface used for photo blobs (typed loosely for portability). */
interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

/** Cap a single upload to protect the Durable Object (client downscales first). */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export class RoomDurableObject {
  private readonly service: RoomService;
  /** Email-login service; null until AUTH_SECRET is configured (auth stays off). */
  private readonly authSvc: WcAuthService | null;
  private readonly sockets = new Set<WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    const kv = {
      get: (key: string) => this.state.storage.get<string>(key).then((v) => v ?? null),
      put: (key: string, value: string) => this.state.storage.put(key, value),
    };
    this.service = new RoomService(kv);
    this.authSvc = env.AUTH_SECRET ? new WcAuthService(kv, env.AUTH_SECRET) : null;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, created_at TEXT)',
    );
  }

  /** SQLite handle (available on SQLite-backed Durable Objects). */
  private get sql(): SqlStorage {
    return (this.state.storage as unknown as { sql: SqlStorage }).sql;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const r = route(request.method, url.pathname);
    const cors = corsHeaders(request.headers.get('Origin'), this.env.ALLOWED_ORIGINS);

    switch (r.kind) {
      case 'ws':
        return this.handleWebSocket(request, cors);

      case 'create': {
        const body = await request.json().catch(() => null);
        if (!isRoomState(body)) return json({ error: 'Invalid room' }, { status: 400 }, cors);
        try {
          const saved = await this.service.create(body);
          return json(saved, { status: 201 }, cors);
        } catch (e) {
          if (e instanceof RoomConflictError) {
            return json({ error: 'Room already exists' }, { status: 409 }, cors);
          }
          throw e;
        }
      }

      case 'get': {
        const room = await this.service.get();
        return room ? json(room, {}, cors) : json({ error: 'Not found' }, { status: 404 }, cors);
      }

      case 'save': {
        const body = await request.json().catch(() => null);
        if (!isRoomState(body)) return json({ error: 'Invalid room' }, { status: 400 }, cors);
        return this.saveRoom(request, body as RoomState, cors);
      }

      case 'wc-auth-request':
        return this.wcAuthRequest(request, cors);
      case 'wc-auth-verify':
        return this.wcAuthVerify(request, cors);
      case 'wc-auth-release':
        return this.wcAuthRelease(request, cors);

      case 'photo-put':
        return this.putPhoto(request, r.photoId, cors);
      case 'photo-get':
        return this.getPhoto(r.photoId, cors);
      case 'photo-del':
        this.sql.exec('DELETE FROM photos WHERE id = ?', r.photoId);
        return json({ ok: true }, {}, cors);

      default:
        return json({ error: 'Not found' }, { status: 404 }, cors);
    }
  }

  /** Persist a full-state save, enforcing the per-name lock: once a predictor is
   * claimed, only its verified owner (proven by the X-WC-Session token) may change
   * its picks. Until anyone claims, every save passes unchanged. The server also
   * stamps the authoritative `claimed` flags so clients can't forge them. */
  private async saveRoom(
    request: Request,
    body: RoomState,
    cors: Record<string, string>,
  ): Promise<Response> {
    let toSave: RoomState = body;
    if (this.authSvc && body.worldCup) {
      const claimed = await this.authSvc.claimedIds();
      if (claimed.size > 0) {
        const prev = await this.service.get();
        if (prev?.worldCup) {
          const token = request.headers.get('X-WC-Session');
          const owner = token ? await readSessionToken(token, this.env.AUTH_SECRET!) : null;
          const decision = authorizeWcWrite(prev.worldCup, body.worldCup, claimed, owner);
          if (!decision.ok) {
            return json({ error: 'locked', lockedId: decision.lockedId }, { status: 403 }, cors);
          }
        }
      }
      const stampedWc = stampClaimed(body.worldCup, claimed);
      if (stampedWc !== body.worldCup) toSave = { ...body, worldCup: stampedWc };
    }
    const saved = await this.service.save(toSave);
    this.broadcast(saved);
    return json(saved, {}, cors);
  }

  /** Re-stamp `claimed` flags into the stored state and broadcast, so every device
   * sees a lock appear/disappear the instant a name is claimed or released. */
  private async restampAndBroadcast(): Promise<void> {
    if (!this.authSvc) return;
    const room = await this.service.get();
    if (!room?.worldCup) return;
    const claimed = await this.authSvc.claimedIds();
    const stampedWc = stampClaimed(room.worldCup, claimed);
    if (stampedWc !== room.worldCup) {
      this.broadcast(await this.service.save({ ...room, worldCup: stampedWc }));
    }
  }

  /** POST /wc-auth/request — email a login code for a name (frugally). */
  private async wcAuthRequest(request: Request, cors: Record<string, string>): Promise<Response> {
    if (!this.authSvc) return json({ error: 'auth-not-configured' }, { status: 503 }, cors);
    if (!emailConfigured(this.env)) {
      return json({ error: 'email-not-configured' }, { status: 503 }, cors);
    }
    const body = (await request.json().catch(() => null)) as {
      predictorId?: string;
      email?: string;
    } | null;
    if (!body?.predictorId || !body?.email) {
      return json({ error: 'bad-request' }, { status: 400 }, cors);
    }
    const room = await this.service.get();
    if (!room?.worldCup?.predictors.some((p) => p.id === body.predictorId)) {
      return json({ error: 'unknown-predictor' }, { status: 404 }, cors);
    }
    try {
      const r = await this.authSvc.requestCode(body.predictorId, body.email, (to, code) =>
        sendOtpEmail(this.env, to, code),
      );
      return json(r.body, { status: r.status }, cors);
    } catch {
      return json({ error: 'send-failed' }, { status: 502 }, cors);
    }
  }

  /** POST /wc-auth/verify — check a code, bind the email, return a session token. */
  private async wcAuthVerify(request: Request, cors: Record<string, string>): Promise<Response> {
    if (!this.authSvc) return json({ error: 'auth-not-configured' }, { status: 503 }, cors);
    const body = (await request.json().catch(() => null)) as {
      predictorId?: string;
      code?: string;
    } | null;
    if (!body?.predictorId || !body?.code) {
      return json({ error: 'bad-request' }, { status: 400 }, cors);
    }
    const r = await this.authSvc.verifyCode(body.predictorId, body.code);
    if (r.status === 200 && r.claimedChanged) await this.restampAndBroadcast();
    return json(r.body, { status: r.status }, cors);
  }

  /** POST /wc-auth/release — organiser-only (X-WC-Admin) unbind, so a wrongly
   * claimed name can be re-claimed. */
  private async wcAuthRelease(request: Request, cors: Record<string, string>): Promise<Response> {
    if (!this.authSvc) return json({ error: 'auth-not-configured' }, { status: 503 }, cors);
    if (!this.env.WC_ADMIN_TOKEN || request.headers.get('X-WC-Admin') !== this.env.WC_ADMIN_TOKEN) {
      return json({ error: 'forbidden' }, { status: 403 }, cors);
    }
    const body = (await request.json().catch(() => null)) as { predictorId?: string } | null;
    if (!body?.predictorId) return json({ error: 'bad-request' }, { status: 400 }, cors);
    const released = await this.authSvc.release(body.predictorId);
    await this.restampAndBroadcast();
    return json({ ok: true, released }, {}, cors);
  }

  private async putPhoto(
    request: Request,
    photoId: string,
    cors: Record<string, string>,
  ): Promise<Response> {
    const buf = await request.arrayBuffer();
    if (buf.byteLength === 0) return json({ error: 'Empty body' }, { status: 400 }, cors);
    if (buf.byteLength > MAX_PHOTO_BYTES) {
      return json({ error: 'Photo too large' }, { status: 413 }, cors);
    }
    const mime = request.headers.get('Content-Type') ?? 'image/jpeg';
    this.sql.exec(
      'INSERT OR REPLACE INTO photos (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)',
      photoId,
      mime,
      new Uint8Array(buf),
      new Date().toISOString(),
    );
    return json({ id: photoId }, { status: 201 }, cors);
  }

  private getPhoto(photoId: string, cors: Record<string, string>): Response {
    const rows = this.sql.exec('SELECT mime, bytes FROM photos WHERE id = ?', photoId).toArray();
    const row = rows[0];
    if (!row) return json({ error: 'Not found' }, { status: 404 }, cors);
    const bytes = row.bytes as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': (row.mime as string) || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  private handleWebSocket(request: Request, cors: Record<string, string>): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'Expected a WebSocket upgrade' }, { status: 426 }, cors);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.add(server);

    // Push the current state immediately so the client renders without a round-trip.
    void this.service.get().then((room) => {
      if (room) safeSend(server, JSON.stringify(room));
    });

    // Relay ephemeral presence frames (e.g. live cursors) to everyone else.
    server.addEventListener('message', (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!isPresenceFrame(raw)) return;
      for (const ws of this.sockets) {
        if (ws !== server) safeSend(ws, raw);
      }
    });
    server.addEventListener('close', () => this.sockets.delete(server));
    server.addEventListener('error', () => this.sockets.delete(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(state: RoomState): void {
    const payload = JSON.stringify(state);
    for (const ws of this.sockets) {
      if (!safeSend(ws, payload)) this.sockets.delete(ws);
    }
  }
}

function safeSend(ws: WebSocket, payload: string): boolean {
  try {
    ws.send(payload);
    return true;
  } catch {
    return false;
  }
}
