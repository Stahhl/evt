/** Resolves abilities against a Draft. */
import {
  ABILITIES,
  CONDUCTION_DAMAGE,
  CONDUCTIVE,
  FREEZE_TURNS,
  REACTIONS,
  STEAM_DODGE_PERCENT,
} from "./abilities.ts";
import type { Draft } from "./draft.ts";
import { area, distance, inBounds, indexPos, isStandable, posIndex } from "./map.ts";
import type { AbilityId, MatchState, Pos, Unit } from "./types.ts";

const NEIGHBOURS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Chance in percent that `unit` dodges a basic attack where it stands. */
export function dodgeChance(state: MatchState, unit: Unit): number {
  const tile = state.map.tiles[posIndex(state.map, unit)];
  return tile?.surface?.kind === "steam" ? STEAM_DODGE_PERCENT : 0;
}

export function resolveAbility(d: Draft, caster: Unit, ability: AbilityId, target: Pos): void {
  const def = ABILITIES[ability];
  d.events.push({ type: "abilityUsed", unit: caster.id, ability, target });
  if (ability === "iceWall") {
    d.setSurface(target, "iceWall");
  } else if (ability === "chainLightning") {
    chainLightning(d, caster, target);
  } else {
    blast(d, ability, target, def.radius);
  }
}

/**
 * Damages every unit in the area, then lets the element react with each tile
 * as it was before the blast. Melting ice walls spill water onto their
 * neighbours afterwards.
 */
function blast(d: Draft, ability: AbilityId, center: Pos, radius: number): void {
  const def = ABILITIES[ability];
  const tiles = area(d.base.map, center, radius);
  const before = tiles.map((pos) => d.tile(pos).surface?.kind ?? null);

  if (def.damage > 0) {
    for (const u of d.units.filter(
      (v) => v.hp > 0 && tiles.some((p) => p.x === v.x && p.y === v.y),
    )) {
      d.damage(u.id, def.damage, (amount) => ({
        type: "damaged",
        unit: u.id,
        amount,
        source: ability,
      }));
    }
  }

  const spills: Pos[] = [];
  for (const [i, pos] of tiles.entries()) {
    const kind = before[i];
    const reaction = kind ? REACTIONS[def.element][kind] : undefined;
    if (!reaction) continue;
    d.setSurface(pos, reaction.to);
    if (reaction.spill) spills.push(pos);
    const standing = d.unitAt(pos);
    if (reaction.freeze && standing) {
      d.addStatus(standing.id, { kind: "frozen", turns: FREEZE_TURNS });
      d.events.push({ type: "frozen", unit: standing.id, turns: FREEZE_TURNS });
    }
  }

  // Water from a melted wall runs onto bare neighbours that are not higher.
  for (const pos of spills) {
    const height = d.tile(pos).height;
    for (const step of NEIGHBOURS) {
      const next = { x: pos.x + step.x, y: pos.y + step.y };
      if (!inBounds(d.base.map, next)) continue;
      const tile = d.tile(next);
      if (isStandable(tile) && tile.surface === null && tile.height <= height) {
        d.setSurface(next, "puddle");
      }
    }
  }
}

/**
 * Hits the target, then jumps to the nearest enemy of the caster within
 * jumpRange of the last unit hit, up to `jumps` times; ties go by setup order.
 * When a unit hit stands in water, the lightning conducts through the whole
 * connected body of water: it becomes electrified and everyone in it takes
 * CONDUCTION_DAMAGE, once per cast.
 */
function chainLightning(d: Draft, caster: Unit, target: Pos): void {
  const def = ABILITIES.chainLightning;
  const hit = new Set<string>();
  const conducted = new Set<number>();
  let current = d.unitAt(target);
  for (let jump = 0; current && jump <= (def.jumps ?? 0); jump++) {
    const unit = current;
    hit.add(unit.id);
    d.damage(unit.id, def.damage, (amount) => ({
      type: "damaged",
      unit: unit.id,
      amount,
      source: "chainLightning",
    }));
    conduct(d, unit, conducted);
    current = d.units
      .filter(
        (u) =>
          u.hp > 0 &&
          u.team !== caster.team &&
          !hit.has(u.id) &&
          distance(u, unit) <= (def.jumpRange ?? 0),
      )
      .sort((a, b) => distance(a, unit) - distance(b, unit))[0];
  }
}

function conduct(d: Draft, from: Pos, conducted: Set<number>): void {
  const { map } = d.base;
  const start = posIndex(map, from);
  const kind = d.tile(from).surface?.kind;
  if (!kind || !CONDUCTIVE.has(kind) || conducted.has(start)) return;

  // Flood fill over 4-neighbours with conductive surfaces.
  const region: number[] = [];
  const queue = [start];
  conducted.add(start);
  while (queue.length > 0) {
    const index = queue.shift() as number;
    region.push(index);
    const pos = indexPos(map, index);
    for (const step of NEIGHBOURS) {
      const next = { x: pos.x + step.x, y: pos.y + step.y };
      if (!inBounds(map, next)) continue;
      const i = posIndex(map, next);
      const k = d.tile(next).surface?.kind;
      if (k && CONDUCTIVE.has(k) && !conducted.has(i)) {
        conducted.add(i);
        queue.push(i);
      }
    }
  }
  region.sort((a, b) => a - b);
  for (const index of region) d.setSurface(indexPos(map, index), "electrified");
  const inWater = new Set(region);
  for (const u of d.units) {
    if (u.hp > 0 && inWater.has(posIndex(map, u))) {
      d.damage(u.id, CONDUCTION_DAMAGE, (amount) => ({
        type: "damaged",
        unit: u.id,
        amount,
        source: "conduction",
      }));
    }
  }
}
