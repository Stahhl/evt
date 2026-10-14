import type { GameMap, Pos, Tile } from "./types.ts";

export function inBounds(map: GameMap, pos: Pos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < map.cols && pos.y < map.rows;
}

export function tileAt(map: GameMap, pos: Pos): Tile | undefined {
  return inBounds(map, pos) ? map.tiles[pos.y * map.cols + pos.x] : undefined;
}

/** Whether a unit may stand on the tile at all, ignoring other units. */
export function isStandable(tile: Tile): boolean {
  return tile.terrain !== "water" && tile.object === null;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}
