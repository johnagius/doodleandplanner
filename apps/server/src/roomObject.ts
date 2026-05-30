/**
 * One Durable Object instance per room. It owns the canonical RoomState and
 * fans every change out to all connected WebSocket clients in real time.
 */
import type { RoomState } from '@dap/shared';
import { RoomConflictError, RoomService, isRoomState } from './roomService.js';
import { corsHeaders, isPresenceFrame, json, route } from './router.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

/** Minimal SQLite surface used for photo blobs (typed loosely for portability). */
interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

/** Cap a single upload to protect the Durable Object (client downscales first). */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export class RoomDurableObject {
  private readonly service: RoomService;
  private readonly sockets = new Set<WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.service = new RoomService({
      get: (key) => this.state.storage.get<string>(key).then((v) => v ?? null),
      put: (key, value) => this.state.storage.put(key, value),
    });
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
        const saved = await this.service.save(body);
        this.broadcast(saved);
        return json(saved, {}, cors);
      }

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
