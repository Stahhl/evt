import type { Action, GameEvent, MatchState, Team } from "@evt/engine";

/** One accepted action and what it did. */
export interface HostUpdate {
  readonly action: Action;
  readonly events: readonly GameEvent[];
  readonly state: MatchState;
}

/**
 * What the client talks to during a match. LocalHost runs the engine and the
 * bots in the browser; a RemoteHost will talk to the match's Durable Object.
 * The UI only sends intents and renders the updates that come back, so it
 * works the same with both.
 */
export interface GameHost {
  /** The state after the latest update. */
  readonly state: MatchState;
  /** Teams controlled by the person in front of this client. */
  readonly localTeams: readonly Team[];
  /** Sends an intent. Rejected actions throw; accepted ones arrive as an update. */
  submit(action: Action): void;
  /** Called once per accepted action, in order. Returns an unsubscribe function. */
  subscribe(listener: (update: HostUpdate) => void): () => void;
  /** Stops bots and timers. */
  dispose(): void;
}
