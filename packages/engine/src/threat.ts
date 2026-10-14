/**
 * Threat view: tiles the other side could hit on their next turns. It is an
 * aid for the player, not a rule, so it may overestimate slightly.
 */
import { ABILITIES } from "./abilities.ts";
import { area, posIndex } from "./map.ts";
import { reachableTiles } from "./movement.ts";
import { hasLineOfSight } from "./sight.ts";
import type { MatchState, Pos, Team, Unit } from "./types.ts";

/** How far a unit can hit from where it stands: its attack or a ready ability, plus the ability's radius. */
function reach(unit: Unit): number {
  let r = unit.range;
  for (const a of unit.abilities) {
    const def = ABILITIES[a];
    if ((unit.cooldowns[a] ?? 0) <= 1 && def.damage > 0) r = Math.max(r, def.range + def.radius);
  }
  return r;
}

/**
 * Tiles that a living unit not on `team` could hit next turn: it moves to any
 * tile it can reach (or stays), then attacks or uses an ability that will be
 * ready. Line of sight is checked from each place it could stand; an area's
 * radius is added to the range, which can overestimate behind walls.
 * Returns row-major tile indices, each with the ids of the units threatening it.
 */
export function threatenedTiles(state: MatchState, team: Team): Map<number, string[]> {
  const { map } = state;
  const threats = new Map<number, string[]>();
  for (const enemy of state.units) {
    if (enemy.hp === 0 || enemy.team === team) continue;
    const standpoints: Pos[] = [enemy, ...reachableTiles(state, enemy).map((r) => r.to)];
    const r = reach(enemy);
    const hit = new Set<number>();
    for (const from of standpoints) {
      for (const pos of area(map, from, r)) {
        const index = posIndex(map, pos);
        if (!hit.has(index) && hasLineOfSight(map, from, pos)) hit.add(index);
      }
    }
    for (const index of hit) threats.set(index, [...(threats.get(index) ?? []), enemy.id]);
  }
  return threats;
}
