/**
 * A match is stored as its setup and the actions taken. Running the engine
 * again reproduces every state, so replays can be analysed, branched and used
 * as regression tests. The hash after each step catches any divergence at the
 * step where it happens.
 */
import { hashState } from "./hash.ts";
import { apply, createMatch, type MatchSetup } from "./match.ts";
import type { Action, MatchState } from "./types.ts";
import { RULES_VERSION } from "./version.ts";

export interface Replay {
  readonly rulesVersion: string;
  readonly setup: MatchSetup;
  readonly actions: readonly Action[];
  /** hashState after setup and after each action, so actions.length + 1 entries. */
  readonly hashes: readonly string[];
}

/** Collects a replay while a match is played. */
export class ReplayRecorder {
  readonly #setup: MatchSetup;
  readonly #actions: Action[] = [];
  readonly #hashes: string[];

  constructor(setup: MatchSetup, initial: MatchState) {
    this.#setup = setup;
    this.#hashes = [hashState(initial)];
  }

  record(action: Action, after: MatchState): void {
    this.#actions.push(action);
    this.#hashes.push(hashState(after));
  }

  toJSON(): Replay {
    return {
      rulesVersion: RULES_VERSION,
      setup: this.#setup,
      actions: [...this.#actions],
      hashes: [...this.#hashes],
    };
  }
}

export type ReplayCheck =
  | { readonly ok: true; readonly state: MatchState }
  | {
      readonly ok: false;
      /** 0 is the state after setup, n the state after the nth action. */
      readonly step: number;
      readonly reason: string;
    };

/** Runs the replay and compares every state hash with the recorded one. */
export function verifyReplay(replay: Replay): ReplayCheck {
  if (replay.rulesVersion !== RULES_VERSION) {
    return {
      ok: false,
      step: 0,
      reason: `replay uses rules ${replay.rulesVersion}, this engine runs ${RULES_VERSION}`,
    };
  }
  if (replay.hashes.length !== replay.actions.length + 1) {
    return { ok: false, step: 0, reason: "replay needs one hash per action plus the initial one" };
  }
  let state: MatchState;
  try {
    state = createMatch(replay.setup);
  } catch (e) {
    return { ok: false, step: 0, reason: `bad setup: ${(e as Error).message}` };
  }
  for (let step = 0; ; step++) {
    const actual = hashState(state);
    if (actual !== replay.hashes[step]) {
      return { ok: false, step, reason: `hash ${actual}, recorded ${replay.hashes[step]}` };
    }
    const action = replay.actions[step];
    if (!action) return { ok: true, state };
    try {
      state = apply(state, action).state;
    } catch (e) {
      return { ok: false, step: step + 1, reason: (e as Error).message };
    }
  }
}
