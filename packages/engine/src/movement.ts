import { isStandable, tileAt } from "./map.ts";
import type { MatchState, Pos, Unit } from "./types.ts";

/** Fixed neighbour order (north, east, south, west) keeps paths deterministic. */
const STEPS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Every tile the unit can move to this turn, with the path there, in row-major
 * order. Each step costs 1 and may climb or drop at most `jump`. Units can walk
 * through allies but not through enemies, and cannot stop on any unit.
 */
export function reachableTiles(state: MatchState, unit: Unit): { to: Pos; path: Pos[] }[] {
  const { map } = state;
  const occupant = new Map<number, Unit>();
  for (const u of state.units) {
    if (u.hp > 0) occupant.set(u.y * map.cols + u.x, u);
  }

  const start = unit.y * map.cols + unit.x;
  const parent = new Map<number, number>([[start, start]]);
  let frontier = [start];
  for (let distance = 0; distance < unit.move; distance++) {
    const next: number[] = [];
    for (const index of frontier) {
      const from: Pos = { x: index % map.cols, y: Math.floor(index / map.cols) };
      const fromTile = tileAt(map, from);
      if (!fromTile) continue;
      for (const step of STEPS) {
        const to = { x: from.x + step.x, y: from.y + step.y };
        const tile = tileAt(map, to);
        if (!tile || !isStandable(tile)) continue;
        if (Math.abs(tile.height - fromTile.height) > unit.jump) continue;
        const toIndex = to.y * map.cols + to.x;
        if (parent.has(toIndex)) continue;
        const other = occupant.get(toIndex);
        if (other && other.team !== unit.team) continue;
        parent.set(toIndex, index);
        next.push(toIndex);
      }
    }
    frontier = next;
  }

  const result: { to: Pos; path: Pos[] }[] = [];
  for (const index of [...parent.keys()].sort((a, b) => a - b)) {
    if (index === start || occupant.has(index)) continue;
    const path: Pos[] = [];
    for (let i = index; i !== start; i = parent.get(i) ?? start) {
      path.push({ x: i % map.cols, y: Math.floor(i / map.cols) });
    }
    result.push({ to: path[0] as Pos, path: path.reverse() });
  }
  return result;
}
