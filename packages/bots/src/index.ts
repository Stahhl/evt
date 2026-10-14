/**
 * AI opponents: random (a baseline) and greedy (one turn ahead via
 * engine.preview). MCTS comes later.
 *
 * Bots are pure like the engine: the same state always gives the same action.
 * Their randomness comes from their own seed mixed with the state hash, so they
 * need no mutable state and a match between bots replays exactly.
 */
export type { Bot } from "./bot.ts";
export { evaluate, greedyBot, WEIGHTS } from "./greedy.ts";
export { randomBot } from "./random.ts";

import type { Bot } from "./bot.ts";
import { greedyBot } from "./greedy.ts";
import { randomBot } from "./random.ts";

/** Bots by name, for the CLI and balance runs. The seed only matters to bots that use randomness. */
export const BOTS: Readonly<Record<string, (seed: number) => Bot>> = {
  random: (seed) => randomBot(seed),
  greedy: () => greedyBot(),
};
