export { parseScenario } from "./ascii.ts";
export { canonicalize, hashState } from "./hash.ts";
export { inBounds, isStandable, tileAt } from "./map.ts";
export {
  activeUnit,
  apply,
  attackDamage,
  attackTargets,
  checkAction,
  createMatch,
  DEFAULT_STATS,
  HEIGHT_BONUS_CAP,
  HEIGHT_BONUS_PERCENT,
  IllegalActionError,
  legalActions,
  type MatchSetup,
  type Outcome,
  preview,
  type UnitSetup,
  unitAt,
} from "./match.ts";
export { MOVE_COST, reachableTiles } from "./movement.ts";
export {
  nextUint32,
  type RngState,
  rollBelow,
  rollChance,
  seedRng,
} from "./rng.ts";
export { hasLineOfSight, PILLAR_HEIGHT } from "./sight.ts";
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
