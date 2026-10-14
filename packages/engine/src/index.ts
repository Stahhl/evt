export { canonicalize, hashState } from "./hash.ts";
export {
  nextUint32,
  type RngState,
  rollBelow,
  rollChance,
  seedRng,
} from "./rng.ts";

/** Bumped for every change that can alter the outcome of a recorded match. */
export const RULES_VERSION = "v0";
