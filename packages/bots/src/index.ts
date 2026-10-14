/**
 * AI opponents. Planned: random, greedy (1-ply via engine.preview) and MCTS.
 *
 * Bots are pure like the engine: the same state always gives the same action.
 * Their randomness comes from their own seed mixed with the state hash, so they
 * need no mutable state and a match between bots replays exactly.
 */
import {
  type Action,
  hashState,
  legalActions,
  type MatchState,
  rollBelow,
  seedRng,
  type Team,
} from "@evt/engine";

export interface Bot {
  readonly name: string;
  chooseAction(state: MatchState, team: Team): Action;
}

/** A seed for this bot and this state, so equal states give equal choices. */
function stateSeed(seed: number, state: MatchState): number {
  return (seed ^ Number.parseInt(hashState(state).slice(0, 8), 16)) >>> 0;
}

/** Picks uniformly among the legal actions. A baseline, not an opponent. */
export function randomBot(seed: number): Bot {
  return {
    name: "random",
    chooseAction(state, team) {
      const legal = legalActions(state, team);
      if (legal.length === 0) throw new Error(`team ${team} has no legal actions`);
      const [index] = rollBelow(seedRng(stateSeed(seed, state)), legal.length);
      return legal[index] as Action;
    },
  };
}
