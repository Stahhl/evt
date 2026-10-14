export { parseScenario } from "./ascii.ts";
export { canonicalize, hashState } from "./hash.ts";
export { inBounds, isStandable, tileAt } from "./map.ts";
export {
  activeUnit,
  apply,
  checkAction,
  createMatch,
  DEFAULT_STATS,
  IllegalActionError,
  legalActions,
  type MatchSetup,
  type UnitSetup,
} from "./match.ts";
export { reachableTiles } from "./movement.ts";
export {
  nextUint32,
  type RngState,
  rollBelow,
  rollChance,
  seedRng,
} from "./rng.ts";
export type {
  Action,
  GameEvent,
  GameMap,
  MatchState,
  Pos,
  Team,
  Terrain,
  Tile,
  TileObject,
  Unit,
  UnitStats,
} from "./types.ts";

/** Bumped for every change that can alter the outcome of a recorded match. */
export const RULES_VERSION = "v0";
