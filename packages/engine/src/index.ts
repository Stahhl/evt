export { parseScenario } from "./ascii.ts";
export { canonicalize, hashState } from "./hash.ts";
export { inBounds, isStandable, tileAt } from "./map.ts";
export { MAPS } from "./maps.ts";
export {
  activeUnit,
  apply,
  attackDamage,
  attackTargets,
  checkAction,
  createMatch,
  DEFAULT_MAX_ROUNDS,
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
export { type Replay, type ReplayCheck, ReplayRecorder, verifyReplay } from "./replay.ts";
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

export { RULES_VERSION } from "./version.ts";
