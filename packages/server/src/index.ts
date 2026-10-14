import { DurableObject } from "cloudflare:workers";
import { ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "@evt/protocol";

/**
 * One Durable Object per match. It is the authority for the match: it
 * validates actions with the engine, appends them to its log in SQLite and
 * broadcasts the resulting events. WebSocket hibernation keeps idle matches free.
 */
export class Match extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return send(ws, { type: "error", code: "bad_json", message: "Message is not JSON" });
    }
    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) {
      return send(ws, { type: "error", code: "bad_message", message: parsed.error.message });
    }
    const msg = parsed.data;
    if (msg.type === "hello" && msg.protocol < PROTOCOL_VERSION - 1) {
      return send(ws, { type: "error", code: "protocol_too_old", message: "Please reload" });
    }
    // TODO: run actions through the engine once it has rules.
    send(ws, { type: "error", code: "not_implemented", message: `No handler for ${msg.type}` });
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, protocol: PROTOCOL_VERSION });
    }
    const match = url.pathname.match(/^\/api\/matches\/([\w-]{1,64})\/ws$/);
    if (match?.[1]) {
      const stub = env.MATCH.get(env.MATCH.idFromName(match[1]));
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
