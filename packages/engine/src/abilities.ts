/**
 * Elemental abilities and how elements react with surfaces. As much as
 * possible is data; only chain lightning has its own code path.
 */
import type { AbilityId, Element, SurfaceKind } from "./types.ts";

export interface AbilityDef {
  readonly id: AbilityId;
  readonly name: string;
  readonly element: Element;
  /** Largest Manhattan distance to the target tile. The caster needs line of sight to it. */
  readonly range: number;
  /** Own turns before it can be used again. */
  readonly cooldown: number;
  /** tile: any tile; emptyTile: a tile a unit could stand on, with nobody on it; enemy: a tile with an enemy. */
  readonly target: "tile" | "emptyTile" | "enemy";
  /** Tiles within this Manhattan distance of the target are hit. 0 is only the target. */
  readonly radius: number;
  /** Damage to every unit hit. */
  readonly damage: number;
  /** Chain lightning: how many more enemies it jumps to, and how far each jump reaches. */
  readonly jumps?: number;
  readonly jumpRange?: number;
}

export const ABILITIES: Readonly<Record<AbilityId, AbilityDef>> = {
  fireball: {
    id: "fireball",
    name: "Fireball",
    element: "fire",
    range: 4,
    cooldown: 2,
    target: "tile",
    radius: 1,
    damage: 20,
  },
  iceWall: {
    id: "iceWall",
    name: "Ice wall",
    element: "ice",
    range: 4,
    cooldown: 3,
    target: "emptyTile",
    radius: 0,
    damage: 0,
  },
  quickFreeze: {
    id: "quickFreeze",
    name: "Quick freeze",
    element: "ice",
    range: 4,
    cooldown: 2,
    target: "tile",
    radius: 1,
    damage: 10,
  },
  chainLightning: {
    id: "chainLightning",
    name: "Chain lightning",
    element: "lightning",
    range: 4,
    cooldown: 2,
    target: "enemy",
    radius: 0,
    damage: 20,
    jumps: 2,
    jumpRange: 2,
  },
};

export function isAbilityId(id: string): id is AbilityId {
  return Object.hasOwn(ABILITIES, id);
}

/** Rounds a surface lasts before it expires into EXPIRES_TO. null lasts until an element changes it. */
export const SURFACE_ROUNDS: Readonly<Record<SurfaceKind, number | null>> = {
  puddle: null,
  steam: 2,
  ice: 2,
  electrified: 1,
  iceWall: 3,
};

export const EXPIRES_TO: Readonly<Record<SurfaceKind, SurfaceKind | null>> = {
  puddle: null,
  steam: null,
  ice: "puddle",
  electrified: "puddle",
  iceWall: "puddle",
};

export interface Reaction {
  readonly to: SurfaceKind | null;
  /** Melting ice wall: water also runs onto the neighbouring tiles. */
  readonly spill?: boolean;
  /** Units standing on the tile are frozen. */
  readonly freeze?: boolean;
}

/**
 * What a blast of an element does to the surface on each tile it hits.
 * Missing entries mean nothing happens. Lightning does not blast tiles; it
 * conducts through water from the units it hits (see CONDUCTION_DAMAGE).
 */
export const REACTIONS: Readonly<
  Record<Element, Readonly<Partial<Record<SurfaceKind, Reaction>>>>
> = {
  fire: {
    iceWall: { to: "puddle", spill: true },
    ice: { to: "puddle" },
    puddle: { to: "steam" },
    electrified: { to: "steam" },
    steam: { to: "steam" },
  },
  ice: {
    puddle: { to: "ice", freeze: true },
    electrified: { to: "ice", freeze: true },
    steam: { to: "puddle" },
  },
  lightning: {},
};

/** Surfaces lightning conducts through. */
export const CONDUCTIVE: ReadonlySet<SurfaceKind> = new Set(["puddle", "electrified"]);
/** Damage to every unit in a body of water that lightning conducts through. */
export const CONDUCTION_DAMAGE = 15;
/** Damage to a unit that ends its turn on an electrified tile. */
export const ELECTRIFIED_DAMAGE = 10;
/** Chance to dodge a basic attack while standing in steam. */
export const STEAM_DODGE_PERCENT = 50;
/** Own turns a frozen unit skips. */
export const FREEZE_TURNS = 1;
