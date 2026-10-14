import { ABILITIES, ELECTRIFIED_DAMAGE, isAbilityId } from "./abilities.ts";
import { Draft, type ForcedRoll } from "./draft.ts";
import { dodgeChance, resolveAbility } from "./effects.ts";
import { area, distance, inBounds, isStandable, samePos, tileAt } from "./map.ts";
import { reachableTiles } from "./movement.ts";
import { seedRng } from "./rng.ts";
import { hasLineOfSight } from "./sight.ts";
import type {
  AbilityId,
  Action,
  GameEvent,
  GameMap,
  MatchState,
  Pos,
  Team,
  Unit,
  UnitStats,
} from "./types.ts";

/** Placeholder stats until units have classes. */
export const DEFAULT_STATS: UnitStats = {
  maxHp: 100,
  move: 4,
  jump: 1,
  initiative: 10,
  attack: 30,
  range: 1,
};

/** Damage changes by this many percent per block the attacker stands above the target. */
export const HEIGHT_BONUS_PERCENT = 10;
/** Height differences beyond this many blocks give no further bonus or penalty. */
export const HEIGHT_BONUS_CAP = 3;

export type UnitSetup = { readonly id: string; readonly team: Team } & Pos &
  Partial<UnitStats> & { readonly abilities?: readonly AbilityId[] };

export interface MatchSetup {
  readonly map: GameMap;
  /** Setup order breaks initiative ties. */
  readonly units: readonly UnitSetup[];
  readonly seed: number;
  /** Defaults to DEFAULT_MAX_ROUNDS. */
  readonly maxRounds?: number;
}

/** Ends matches that stall, e.g. between two random bots, as a draw. */
export const DEFAULT_MAX_ROUNDS = 30;

export class IllegalActionError extends Error {
  override name = "IllegalActionError";
}

export function createMatch(setup: MatchSetup): MatchState {
  if (setup.map.tiles.length !== setup.map.cols * setup.map.rows) {
    throw new RangeError(
      `map has ${setup.map.tiles.length} tiles, expected ${setup.map.cols * setup.map.rows}`,
    );
  }
  // Normalise tiles so maps from older JSON without surfaces hash the same way.
  const map: GameMap = {
    ...setup.map,
    tiles: setup.map.tiles.map((t) => ({
      height: t.height,
      terrain: t.terrain,
      object: t.object,
      surface: t.surface ?? null,
    })),
  };
  const ids = new Set<string>();
  const units: Unit[] = setup.units.map((u) => {
    if (ids.has(u.id)) throw new RangeError(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    const tile = tileAt(map, u);
    if (!tile || !isStandable(tile)) {
      throw new RangeError(`unit ${u.id} cannot stand at (${u.x}, ${u.y})`);
    }
    const abilities = [...(u.abilities ?? [])];
    for (const a of abilities) {
      if (!isAbilityId(a)) throw new RangeError(`unit ${u.id} has unknown ability ${a}`);
    }
    if (new Set(abilities).size !== abilities.length) {
      throw new RangeError(`unit ${u.id} lists an ability twice`);
    }
    const stats: UnitStats = {
      maxHp: u.maxHp ?? DEFAULT_STATS.maxHp,
      move: u.move ?? DEFAULT_STATS.move,
      jump: u.jump ?? DEFAULT_STATS.jump,
      initiative: u.initiative ?? DEFAULT_STATS.initiative,
      attack: u.attack ?? DEFAULT_STATS.attack,
      range: u.range ?? DEFAULT_STATS.range,
    };
    return {
      id: u.id,
      team: u.team,
      x: u.x,
      y: u.y,
      ...stats,
      hp: stats.maxHp,
      abilities,
      cooldowns: Object.fromEntries(abilities.map((a) => [a, 0])),
      statuses: [],
    };
  });
  for (const [i, a] of units.entries()) {
    const b = units.slice(i + 1).find((other) => samePos(a, other));
    if (b) throw new RangeError(`units ${a.id} and ${b.id} share a tile`);
  }
  if (new Set(units.map((u) => u.team)).size < 2) {
    throw new RangeError("a match needs at least two teams");
  }
  const maxRounds = setup.maxRounds ?? DEFAULT_MAX_ROUNDS;
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new RangeError(`maxRounds must be a positive integer, got ${maxRounds}`);
  }

  return {
    map,
    units,
    round: 1,
    maxRounds,
    queue: initiativeOrder(units),
    turn: { moved: false, acted: false },
    rng: seedRng(setup.seed),
    result: null,
  };
}

/** The unit whose turn it is, or undefined once the match has ended. */
export function activeUnit(state: MatchState): Unit | undefined {
  if (state.result) return undefined;
  const id = state.queue[0];
  return state.units.find((u) => u.id === id);
}

/** The living unit on a tile, if any. */
export function unitAt(state: MatchState, pos: Pos): Unit | undefined {
  return state.units.find((u) => u.hp > 0 && samePos(u, pos));
}

/** Range is Manhattan distance on the grid, and the attacker needs line of sight. */
function canAttack(state: MatchState, attacker: Unit, target: Unit): boolean {
  return (
    distance(attacker, target) <= attacker.range && hasLineOfSight(state.map, attacker, target)
  );
}

/** Living enemies the unit could attack from where it stands, in setup order. */
export function attackTargets(state: MatchState, unit: Unit): Unit[] {
  return state.units.filter((u) => u.hp > 0 && u.team !== unit.team && canAttack(state, unit, u));
}

/**
 * Basic attack damage. Every block the attacker stands above the target adds
 * HEIGHT_BONUS_PERCENT, every block below removes it, capped at HEIGHT_BONUS_CAP
 * blocks. Rounded down.
 */
export function attackDamage(map: GameMap, attacker: Unit, target: Unit): number {
  const diff = (tileAt(map, attacker)?.height ?? 0) - (tileAt(map, target)?.height ?? 0);
  const blocks = Math.max(-HEIGHT_BONUS_CAP, Math.min(HEIGHT_BONUS_CAP, diff));
  return Math.floor((attacker.attack * (100 + blocks * HEIGHT_BONUS_PERCENT)) / 100);
}

/** Tiles the unit could target with the ability from where it stands, in row-major order. */
export function abilityTargets(state: MatchState, unit: Unit, ability: AbilityId): Pos[] {
  const def = ABILITIES[ability];
  const fits = (pos: Pos): boolean => {
    const occupant = unitAt(state, pos);
    if (def.target === "enemy") return occupant !== undefined && occupant.team !== unit.team;
    if (def.target === "emptyTile") {
      const tile = tileAt(state.map, pos);
      return !occupant && tile !== undefined && isStandable(tile);
    }
    return true;
  };
  return area(state.map, unit, def.range).filter(
    (pos) => fits(pos) && hasLineOfSight(state.map, unit, pos),
  );
}

/** Abilities the unit can use this turn. */
export function readyAbilities(state: MatchState, unit: Unit): AbilityId[] {
  if (state.turn.acted) return [];
  return unit.abilities.filter((a) => (unit.cooldowns[a] ?? 0) === 0);
}

/** Why the action is illegal, or null if it is legal. */
export function checkAction(state: MatchState, action: Action): string | null {
  const active = activeUnit(state);
  if (!active) return "the match has ended";
  if (action.unit !== active.id) return `it is ${active.id}'s turn, not ${action.unit}'s`;
  switch (action.type) {
    case "move":
      if (state.turn.moved) return `${active.id} has already moved this turn`;
      if (!inBounds(state.map, action.to)) return "destination is off the map";
      if (!reachableTiles(state, active).some((r) => samePos(r.to, action.to))) {
        return `${active.id} cannot reach (${action.to.x}, ${action.to.y})`;
      }
      return null;
    case "attack": {
      if (state.turn.acted) return `${active.id} has already acted this turn`;
      const target = unitAt(state, action.target);
      if (!target || target.team === active.team) return "there is no enemy on that tile";
      if (!canAttack(state, active, target)) {
        return `${active.id} cannot reach ${target.id} from (${active.x}, ${active.y})`;
      }
      return null;
    }
    case "ability": {
      if (state.turn.acted) return `${active.id} has already acted this turn`;
      if (!isAbilityId(action.ability) || !active.abilities.includes(action.ability)) {
        return `${active.id} does not have ${action.ability}`;
      }
      const cooldown = active.cooldowns[action.ability] ?? 0;
      if (cooldown > 0) return `${action.ability} is ready in ${cooldown} turns`;
      if (!abilityTargets(state, active, action.ability).some((p) => samePos(p, action.target))) {
        return `${action.ability} cannot target (${action.target.x}, ${action.target.y})`;
      }
      return null;
    }
    case "endTurn":
      return null;
  }
}

export function legalActions(state: MatchState, team: Team): Action[] {
  const active = activeUnit(state);
  if (!active || active.team !== team) return [];
  const actions: Action[] = [];
  if (!state.turn.moved) {
    for (const { to } of reachableTiles(state, active)) {
      actions.push({ type: "move", unit: active.id, to });
    }
  }
  if (!state.turn.acted) {
    for (const target of attackTargets(state, active)) {
      actions.push({ type: "attack", unit: active.id, target: { x: target.x, y: target.y } });
    }
    for (const ability of readyAbilities(state, active)) {
      for (const target of abilityTargets(state, active, ability)) {
        actions.push({ type: "ability", unit: active.id, ability, target });
      }
    }
  }
  actions.push({ type: "endTurn", unit: active.id });
  return actions;
}

/** Pure: returns a new state and never modifies the one passed in. */
export function apply(
  state: MatchState,
  action: Action,
): { state: MatchState; events: GameEvent[] } {
  return applyWith(state, action);
}

function applyWith(
  state: MatchState,
  action: Action,
  forced?: ForcedRoll,
): { state: MatchState; events: GameEvent[] } {
  const reason = checkAction(state, action);
  if (reason) throw new IllegalActionError(reason);
  const d = new Draft(state, forced);
  const actor = activeUnit(state) as Unit;

  switch (action.type) {
    case "move": {
      const route = reachableTiles(state, actor).find((r) => samePos(r.to, action.to));
      d.updateUnit(actor.id, { x: action.to.x, y: action.to.y });
      d.turn.moved = true;
      d.events.push({ type: "moved", unit: actor.id, path: route?.path ?? [action.to] });
      break;
    }
    case "attack": {
      const target = unitAt(state, action.target) as Unit;
      const chance = dodgeChance(state, target);
      let dodged = false;
      if (chance > 0) {
        dodged = d.roll(chance);
        d.events.push({ type: "dodge", unit: target.id, chance, success: dodged });
      }
      if (dodged) {
        d.events.push({ type: "attacked", unit: actor.id, target: target.id, damage: 0 });
      } else {
        d.damage(target.id, attackDamage(state.map, actor, target), (damage) => ({
          type: "attacked",
          unit: actor.id,
          target: target.id,
          damage,
        }));
      }
      d.turn.acted = true;
      break;
    }
    case "ability": {
      const def = ABILITIES[action.ability];
      d.updateUnit(actor.id, { cooldowns: { ...actor.cooldowns, [action.ability]: def.cooldown } });
      resolveAbility(d, d.unit(actor.id), action.ability, action.target);
      d.turn.acted = true;
      break;
    }
    case "endTurn":
      break;
  }

  if (!endIfDecided(d)) {
    const actorDied = d.unit(actor.id).hp === 0;
    if (action.type === "endTurn" || actorDied || (d.turn.moved && d.turn.acted)) {
      endTurn(d);
    }
  }
  return { state: d.finish(), events: d.events };
}

/** The match is over when at most one team has living units. */
function endIfDecided(d: Draft): boolean {
  const teams = new Set(d.units.filter((u) => u.hp > 0).map((u) => u.team));
  if (teams.size > 1) return false;
  const [winner = null] = teams;
  d.events.push({ type: "matchEnded", winner });
  d.queue = [];
  d.result = { winner };
  return true;
}

/**
 * Ends the active unit's turn and starts the next one. A unit that ends its
 * turn on an electrified tile is shocked. At the start of each unit's turn
 * its cooldowns count down; a frozen unit then skips the turn.
 */
function endTurn(d: Draft): void {
  const current = d.queue[0];
  if (current !== undefined) {
    const u = d.unit(current);
    if (u.hp > 0 && d.tile(u).surface?.kind === "electrified") {
      d.damage(u.id, ELECTRIFIED_DAMAGE, (amount) => ({
        type: "damaged",
        unit: u.id,
        amount,
        source: "electrified",
      }));
      if (endIfDecided(d)) return;
    }
    d.events.push({ type: "turnEnded", unit: current });
  }
  d.queue = d.queue.slice(1);

  for (;;) {
    d.queue = d.queue.filter((id) => d.unit(id).hp > 0);
    if (d.queue.length === 0) {
      if (d.round === d.base.maxRounds) {
        d.events.push({ type: "matchEnded", winner: null });
        d.result = { winner: null };
        return;
      }
      d.round++;
      d.events.push({ type: "roundStarted", round: d.round });
      d.tickSurfaces();
      d.queue = initiativeOrder(d.units);
    }
    const next = d.unit(d.queue[0] as string);
    const cooldowns = Object.fromEntries(
      Object.entries(next.cooldowns).map(([a, n]) => [a, Math.max(0, n - 1)]),
    );
    const frozen = next.statuses.find((s) => s.kind === "frozen");
    const statuses = next.statuses.flatMap((s) =>
      s === frozen ? (s.turns > 1 ? [{ ...s, turns: s.turns - 1 }] : []) : [s],
    );
    d.updateUnit(next.id, { cooldowns, statuses });
    d.turn = { moved: false, acted: false };
    if (!frozen) {
      d.events.push({ type: "turnStarted", unit: next.id });
      return;
    }
    d.events.push({ type: "turnSkipped", unit: next.id });
    d.queue = d.queue.slice(1);
  }
}

/** Living units, highest initiative first. Ties keep setup order. */
function initiativeOrder(units: readonly Unit[]): string[] {
  return units
    .filter((u) => u.hp > 0)
    .map((u, index) => ({ u, index }))
    .sort((a, b) => b.u.initiative - a.u.initiative || a.index - b.index)
    .map(({ u }) => u.id);
}

/** One possible result of an action, with its probability. */
export interface Branch {
  /** Between 0 and 1. The branches of an outcome add up to 1. */
  readonly chance: number;
  readonly state: MatchState;
  readonly events: readonly GameEvent[];
  /** hp lost (negative) or gained (positive) per unit, only units that changed. */
  readonly hpChanges: readonly { readonly unit: string; readonly delta: number }[];
  readonly deaths: readonly string[];
}

export interface Outcome {
  /** Every way the action can turn out. A deterministic action has one branch. */
  readonly branches: readonly Branch[];
}

/**
 * What an action could do, for previews in the client and for bots. It runs
 * apply on the same state, never a separate calculation, so a preview cannot
 * disagree with the real outcome. Rolls are not taken from the match rng:
 * every combination of roll results becomes its own branch, so the preview
 * shows the odds without revealing the result.
 */
export function preview(state: MatchState, action: Action): Outcome {
  const branches: Branch[] = [];
  const explore = (prefix: boolean[]) => {
    const chances: number[] = [];
    const { state: next, events } = applyWith(state, action, (percent) => {
      const i = chances.length;
      chances.push(percent);
      return prefix[i] ?? false;
    });
    if (chances.length > prefix.length) {
      explore([...prefix, true]);
      explore([...prefix, false]);
      return;
    }
    const chance = chances.reduce((p, pct, i) => (p * (prefix[i] ? pct : 100 - pct)) / 100, 1);
    const hpChanges = next.units.flatMap((u, i) => {
      const delta = u.hp - (state.units[i] as Unit).hp;
      return delta === 0 ? [] : [{ unit: u.id, delta }];
    });
    const deaths = events.flatMap((e) => (e.type === "died" ? [e.unit] : []));
    branches.push({ chance, state: next, events, hpChanges, deaths });
  };
  explore([]);
  return { branches };
}
