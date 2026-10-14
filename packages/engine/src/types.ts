/**
 * Game state and the messages that change it. Everything here is plain data:
 * integers, strings, booleans, null, arrays and plain objects, so any state can
 * be hashed with hashState and sent over the wire as JSON.
 */
import type { RngState } from "./rng.ts";

export type Terrain = "stone" | "grass" | "water";
export type TileObject = "pillar";

/**
 * What elements leave on a tile. An ice wall is a surface too: it is
 * temporary, made and removed by elements, and blocks like a pillar.
 */
export type SurfaceKind = "puddle" | "steam" | "ice" | "electrified" | "iceWall";

export interface Surface {
  readonly kind: SurfaceKind;
  /** Rounds left before it changes (see SURFACE_ROUNDS), or null if it lasts. */
  readonly rounds: number | null;
}

export interface Tile {
  readonly height: number;
  readonly terrain: Terrain;
  readonly object: TileObject | null;
  readonly surface: Surface | null;
}

export type Element = "fire" | "ice" | "lightning";
export type AbilityId = "fireball" | "iceWall" | "quickFreeze" | "chainLightning";

/** A temporary effect on a unit. */
export interface Status {
  readonly kind: "frozen";
  /** Own turns left. A frozen unit skips its turns. */
  readonly turns: number;
}

/** x is the column, y the row. (0, 0) is the top-left corner in ASCII maps. */
export interface Pos {
  readonly x: number;
  readonly y: number;
}

export interface GameMap {
  readonly cols: number;
  readonly rows: number;
  /** Row-major: the tile at (x, y) is tiles[y * cols + x]. */
  readonly tiles: readonly Tile[];
}

export type Team = number;

export interface UnitStats {
  readonly maxHp: number;
  /** Tiles a unit can walk in one move. */
  readonly move: number;
  /** Largest height difference a unit can step up or down. */
  readonly jump: number;
  /** Higher acts earlier in the round. */
  readonly initiative: number;
  /** Damage of a basic attack between units on the same height. */
  readonly attack: number;
  /** Largest Manhattan distance a basic attack reaches. */
  readonly range: number;
}

export interface Unit extends UnitStats, Pos {
  readonly id: string;
  readonly team: Team;
  /** 0 means dead. Dead units stay in the state for replays and the HUD. */
  readonly hp: number;
  readonly abilities: readonly AbilityId[];
  /** Own turns left until each ability can be used again. 0 means ready. */
  readonly cooldowns: Readonly<Record<string, number>>;
  readonly statuses: readonly Status[];
}

export interface MatchState {
  readonly map: GameMap;
  /** In setup order, which breaks initiative ties. */
  readonly units: readonly Unit[];
  readonly round: number;
  /** The match is a draw if it is still running when this round ends. */
  readonly maxRounds: number;
  /** Units that still act this round. The first one is the active unit. */
  readonly queue: readonly string[];
  /** What the active unit has done this turn. */
  readonly turn: { readonly moved: boolean; readonly acted: boolean };
  readonly rng: RngState;
  /** null while the match is running. winner is null for a draw. */
  readonly result: { readonly winner: Team | null } | null;
}

export type Action =
  | { readonly type: "move"; readonly unit: string; readonly to: Pos }
  /** target is a tile, the same shape as abilities. */
  | { readonly type: "attack"; readonly unit: string; readonly target: Pos }
  | {
      readonly type: "ability";
      readonly unit: string;
      readonly ability: AbilityId;
      readonly target: Pos;
    }
  | { readonly type: "endTurn"; readonly unit: string };

export type GameEvent =
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "turnStarted"; readonly unit: string }
  /** path runs from the first step to the destination; the start is not included. */
  | { readonly type: "moved"; readonly unit: string; readonly path: readonly Pos[] }
  /** A dodge roll, e.g. for a unit standing in steam. Comes before the attack it is for. */
  | {
      readonly type: "dodge";
      readonly unit: string;
      readonly chance: number;
      readonly success: boolean;
    }
  /** A basic attack. damage is 0 if it was dodged. */
  | {
      readonly type: "attacked";
      readonly unit: string;
      readonly target: string;
      readonly damage: number;
    }
  | {
      readonly type: "abilityUsed";
      readonly unit: string;
      readonly ability: AbilityId;
      readonly target: Pos;
    }
  /** Damage from anything but a basic attack. */
  | {
      readonly type: "damaged";
      readonly unit: string;
      readonly amount: number;
      readonly source: AbilityId | "conduction" | "electrified";
    }
  | {
      readonly type: "surfaceChanged";
      readonly pos: Pos;
      readonly from: SurfaceKind | null;
      readonly to: SurfaceKind | null;
    }
  | { readonly type: "frozen"; readonly unit: string; readonly turns: number }
  | { readonly type: "turnSkipped"; readonly unit: string }
  | { readonly type: "died"; readonly unit: string }
  | { readonly type: "turnEnded"; readonly unit: string }
  | { readonly type: "matchEnded"; readonly winner: Team | null };
