import { z } from "zod";

/**
 * Wire protocol between client and server during a match. The server supports
 * PROTOCOL_VERSION and PROTOCOL_VERSION - 1, so open tabs survive a deploy.
 *
 * Actions and events are typed by the engine; they stay `unknown` here until
 * the engine defines them.
 */
export const PROTOCOL_VERSION = 1;

const seq = z.number().int().nonnegative();

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocol: z.number().int() }),
  /** An intent. The server validates it and decides the outcome. */
  z.object({ type: z.literal("action"), seq, action: z.unknown() }),
  /** Sent after a reconnect to catch up on missed events. */
  z.object({ type: z.literal("sync"), fromSeq: seq }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion("type", [
  /** Full state without the rng state, which stays secret until the match ends. */
  z.object({ type: z.literal("snapshot"), seq, state: z.unknown(), stateHash: z.string() }),
  z.object({ type: z.literal("events"), seq, events: z.array(z.unknown()), stateHash: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
