/**
 * Line of sight over the voxel grid, in exact integer arithmetic.
 *
 * The line runs from the middle of the attacker's body to the middle of the
 * target's body: horizontally from tile centre to tile centre, vertically at
 * standing height + 1/2. It is blocked if it passes below the top of any tile
 * column in between (a pillar adds PILLAR_HEIGHT to its tile). Only the tiles
 * strictly between the two are checked, so neighbours always see each other.
 * A line through the exact corner of four tiles only enters the two on the
 * line, so corners never block. Units do not block sight.
 *
 * Coordinates are doubled so every point involved is an integer: tile (x, y)
 * spans [2x, 2x + 2] and its centre is 2x + 1; a unit on height h has its
 * middle at 2h + 1.
 */
import { tileAt } from "./map.ts";
import type { GameMap, Pos, Tile } from "./types.ts";

/** How many blocks a pillar rises above its tile. */
export const PILLAR_HEIGHT = 2;

function columnTop(tile: Tile): number {
  return tile.height + (tile.object === "pillar" ? PILLAR_HEIGHT : 0);
}

export function hasLineOfSight(map: GameMap, from: Pos, to: Pos): boolean {
  const fromTile = tileAt(map, from);
  const toTile = tileAt(map, to);
  if (!fromTile || !toTile) return false;

  const ax = 2 * from.x + 1;
  const ay = 2 * from.y + 1;
  const az = 2 * fromTile.height + 1;
  const dx = 2 * (to.x - from.x);
  const dy = 2 * (to.y - from.y);
  const dz = 2 * toTile.height + 1 - az;
  // The line is P(t) = A + t/D * (dx, dy, dz) for t in [0, D]. D is a multiple of
  // dx and dy, so every crossing of a tile boundary falls on an integer t.
  const D = (dx === 0 ? 1 : Math.abs(dx)) * (dy === 0 ? 1 : Math.abs(dy));

  const crossings = new Set<number>([0, D]);
  for (const [a, d] of [
    [ax, dx],
    [ay, dy],
  ] as const) {
    if (d === 0) continue;
    const lo = Math.min(a, a + d);
    const hi = Math.max(a, a + d);
    for (let boundary = lo + 1; boundary < hi; boundary += 2) {
      crossings.add(((boundary - a) * D) / d);
    }
  }
  const ts = [...crossings].sort((a, b) => a - b);

  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i] as number;
    const t1 = ts[i + 1] as number;
    // The tile a segment lies in is the one under its midpoint. In doubled
    // coordinates times 2D, the midpoint is A * 2D + (t0 + t1) * d.
    const mx = ax * 2 * D + (t0 + t1) * dx;
    const my = ay * 2 * D + (t0 + t1) * dy;
    const pos = { x: Math.floor(mx / (4 * D)), y: Math.floor(my / (4 * D)) };
    if ((pos.x === from.x && pos.y === from.y) || (pos.x === to.x && pos.y === to.y)) continue;
    const tile = tileAt(map, pos);
    if (!tile) return false;
    // The line is straight, so its lowest point in the segment is at one end.
    // Compare z(t) = az + t/D * dz with the doubled column top, scaled by D.
    const top = 2 * columnTop(tile) * D;
    if (az * D + Math.min(t0 * dz, t1 * dz) < top) return false;
  }
  return true;
}
