import type { GameMap, Pos, Tile } from "./types.ts";

export function inBounds(map: GameMap, pos: Pos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < map.cols && pos.y < map.rows;
}

export function tileAt(map: GameMap, pos: Pos): Tile | undefined {
  return inBounds(map, pos) ? map.tiles[pos.y * map.cols + pos.x] : undefined;
}

/** Whether a unit may stand on the tile at all, ignoring other units. */
export function isStandable(tile: Tile): boolean {
  return tile.terrain !== "water" && tile.object === null && tile.surface?.kind !== "iceWall";
}

/** Whether something stands up from the tile and blocks sight: a pillar or an ice wall. */
export function hasWall(tile: Tile): boolean {
  return tile.object === "pillar" || tile.surface?.kind === "iceWall";
}

export function posIndex(map: GameMap, pos: Pos): number {
  return pos.y * map.cols + pos.x;
}

export function indexPos(map: GameMap, index: number): Pos {
  return { x: index % map.cols, y: Math.floor(index / map.cols) };
}

/** Tiles within `radius` Manhattan distance of `center`, in row-major order. */
export function area(map: GameMap, center: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      const pos = { x, y };
      if (inBounds(map, pos) && distance(pos, center) <= radius) out.push(pos);
    }
  }
  return out;
}

export function distance(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}
