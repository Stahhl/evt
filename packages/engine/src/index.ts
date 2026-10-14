export {
  ABILITIES,
  type AbilityDef,
  CONDUCTION_DAMAGE,
  ELECTRIFIED_DAMAGE,
  REACTIONS,
  STEAM_DODGE_PERCENT,
  SURFACE_ROUNDS,
} from "./abilities.ts";
export { parseScenario } from "./ascii.ts";
export { dodgeChance } from "./effects.ts";
export { canonicalize, hashState } from "./hash.ts";
export { area, distance, hasWall, inBounds, isStandable, tileAt } from "./map.ts";
export { MAPS } from "./maps.ts";
export {
  abilityTargets,
  activeUnit,
  apply,
  attackDamage,
  attackTargets,
  type Branch,
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
  readyAbilities,
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
  AbilityId,
  Action,
  Element,
  GameEvent,
  GameMap,
  MatchState,
  Pos,
  Status,
  Surface,
  SurfaceKind,
  Team,
  Terrain,
  Tile,
  TileObject,
  Unit,
  UnitStats,
} from "./types.ts";

export { RULES_VERSION } from "./version.ts";
