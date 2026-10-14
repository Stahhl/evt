/**
 * Game state and the messages that change it. Everything here is plain data:
 * integers, strings, booleans, null, arrays and plain objects, so any state can
 * be hashed with hashState and sent over the wire as JSON.
 */
import type { RngState } from "./rng.ts";

export type Terrain = "stone" | "grass" | "water";
export type TileObject = "pillar";

export interface Tile {
  readonly height: number;
  readonly terrain: Terrain;
  readonly object: TileObject | null;
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
}

export interface Unit extends UnitStats, Pos {
  readonly id: string;
  readonly team: Team;
  /** 0 means dead. Dead units stay in the state for replays and the HUD. */
  readonly hp: number;
}

export interface MatchState {
  readonly map: GameMap;
  /** In setup order, which breaks initiative ties. */
  readonly units: readonly Unit[];
  readonly round: number;
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
  | { readonly type: "endTurn"; readonly unit: string };

export type GameEvent =
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "turnStarted"; readonly unit: string }
  /** path runs from the first step to the destination; the start is not included. */
  | { readonly type: "moved"; readonly unit: string; readonly path: readonly Pos[] }
  | { readonly type: "turnEnded"; readonly unit: string }
  | { readonly type: "matchEnded"; readonly winner: Team | null };
