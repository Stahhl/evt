import { isStandable, tileAt } from "./map.ts";
import type { MatchState, Pos, Terrain, Unit } from "./types.ts";

/** Fixed neighbour order (north, east, south, west) keeps paths deterministic. */
const STEPS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Cost of stepping onto a tile. null means it cannot be entered. */
export const MOVE_COST: Readonly<Record<Terrain, number | null>> = {
  stone: 1,
  grass: 1,
  water: null,
};

/**
 * Every tile the unit can move to this turn, with the cheapest path there, in
 * row-major order. Entering a tile costs MOVE_COST for its terrain, and a step
 * may climb or drop at most `jump`. Units can walk through allies but not
 * through enemies, and cannot stop on any unit. Among equally cheap paths the
 * first one found wins, so the result is deterministic.
 */
export function reachableTiles(state: MatchState, unit: Unit): { to: Pos; path: Pos[] }[] {
  const { map } = state;
  const occupant = new Map<number, Unit>();
  for (const u of state.units) {
    if (u.hp > 0) occupant.set(u.y * map.cols + u.x, u);
  }

  const start = unit.y * map.cols + unit.x;
  const cost = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  // Bucket queue: costs are small integers, so buckets[c] holds tiles reached at cost c.
  const buckets: number[][] = Array.from({ length: unit.move + 1 }, () => []);
  buckets[0]?.push(start);
  for (let c = 0; c <= unit.move; c++) {
    for (const index of buckets[c] ?? []) {
      if (cost.get(index) !== c) continue;
      const from: Pos = { x: index % map.cols, y: Math.floor(index / map.cols) };
      const fromTile = tileAt(map, from);
      if (!fromTile) continue;
      for (const step of STEPS) {
        const to = { x: from.x + step.x, y: from.y + step.y };
        const tile = tileAt(map, to);
        const stepCost = tile ? MOVE_COST[tile.terrain] : null;
        if (!tile || stepCost === null || !isStandable(tile)) continue;
        if (Math.abs(tile.height - fromTile.height) > unit.jump) continue;
        const toIndex = to.y * map.cols + to.x;
        const other = occupant.get(toIndex);
        if (other && other.team !== unit.team) continue;
        const total = c + stepCost;
        if (total > unit.move || total >= (cost.get(toIndex) ?? Infinity)) continue;
        cost.set(toIndex, total);
        parent.set(toIndex, index);
        buckets[total]?.push(toIndex);
      }
    }
  }

  const result: { to: Pos; path: Pos[] }[] = [];
  for (const index of [...cost.keys()].sort((a, b) => a - b)) {
    if (index === start || occupant.has(index)) continue;
    const path: Pos[] = [];
    for (let i = index; i !== start; i = parent.get(i) ?? start) {
      path.push({ x: i % map.cols, y: Math.floor(i / map.cols) });
    }
    result.push({ to: path[0] as Pos, path: path.reverse() });
  }
  return result;
}
