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

      default:
        return json({ error: 'Not found' }, { status: 404 }, cors);
    }
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
