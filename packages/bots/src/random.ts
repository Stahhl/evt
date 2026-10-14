import {
  type Action,
  hashState,
  legalActions,
  type MatchState,
  rollBelow,
  seedRng,
} from "@evt/engine";
import type { Bot } from "./bot.ts";

/** A seed for this bot and this state, so equal states give equal choices. */
export function stateSeed(seed: number, state: MatchState): number {
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
