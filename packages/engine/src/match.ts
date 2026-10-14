import { inBounds, isStandable, samePos, tileAt } from "./map.ts";
import { reachableTiles } from "./movement.ts";
import { seedRng } from "./rng.ts";
import { hasLineOfSight } from "./sight.ts";
import type {
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

export type UnitSetup = { readonly id: string; readonly team: Team } & Pos & Partial<UnitStats>;

export interface MatchSetup {
  readonly map: GameMap;
  /** Setup order breaks initiative ties. */
  readonly units: readonly UnitSetup[];
  readonly seed: number;
}

export class IllegalActionError extends Error {
  override name = "IllegalActionError";
}

export function createMatch(setup: MatchSetup): MatchState {
  const { map } = setup;
  if (map.tiles.length !== map.cols * map.rows) {
    throw new RangeError(`map has ${map.tiles.length} tiles, expected ${map.cols * map.rows}`);
  }
  const ids = new Set<string>();
  const units: Unit[] = setup.units.map((u) => {
    if (ids.has(u.id)) throw new RangeError(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    const tile = tileAt(map, u);
    if (!tile || !isStandable(tile)) {
      throw new RangeError(`unit ${u.id} cannot stand at (${u.x}, ${u.y})`);
    }
    const stats = { ...DEFAULT_STATS, ...u };
    return { ...stats, hp: stats.maxHp };
  });
  for (const [i, a] of units.entries()) {
    const b = units.slice(i + 1).find((other) => samePos(a, other));
    if (b) throw new RangeError(`units ${a.id} and ${b.id} share a tile`);
  }
  if (new Set(units.map((u) => u.team)).size < 2) {
    throw new RangeError("a match needs at least two teams");
  }

  const state: MatchState = {
    map,
    units,
    round: 1,
    queue: initiativeOrder(units),
    turn: { moved: false, acted: false },
    rng: seedRng(setup.seed),
    result: null,
  };
  return state;
}

/** The unit whose turn it is, or undefined once the match has ended. */
export function activeUnit(state: MatchState): Unit | undefined {
  if (state.result) return undefined;
  const id = state.queue[0];
  return state.units.find((u) => u.id === id);
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
    case "endTurn":
      return null;
  }
}

/** The living unit on a tile, if any. */
export function unitAt(state: MatchState, pos: Pos): Unit | undefined {
  return state.units.find((u) => u.hp > 0 && samePos(u, pos));
}

/** Range is Manhattan distance on the grid, and the attacker needs line of sight. */
function canAttack(state: MatchState, attacker: Unit, target: Unit): boolean {
  const distance = Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y);
  return distance <= attacker.range && hasLineOfSight(state.map, attacker, target);
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
  }
  actions.push({ type: "endTurn", unit: active.id });
  return actions;
}

/** Pure: returns a new state and never modifies the one passed in. */
export function apply(
  state: MatchState,
  action: Action,
): { state: MatchState; events: GameEvent[] } {
  const reason = checkAction(state, action);
  if (reason) throw new IllegalActionError(reason);
  const events: GameEvent[] = [];
  let next = state;

  switch (action.type) {
    case "move": {
      const unit = activeUnit(state) as Unit;
      const route = reachableTiles(state, unit).find((r) => samePos(r.to, action.to));
      const path = route?.path ?? [action.to];
      next = {
        ...next,
        units: next.units.map((u) => (u.id === unit.id ? { ...u, ...action.to } : u)),
        turn: { ...next.turn, moved: true },
      };
      events.push({ type: "moved", unit: unit.id, path });
      break;
    }
    case "attack": {
      const attacker = activeUnit(state) as Unit;
      const target = unitAt(state, action.target) as Unit;
      const damage = Math.min(target.hp, attackDamage(state.map, attacker, target));
      const hp = target.hp - damage;
      next = {
        ...next,
        units: next.units.map((u) => (u.id === target.id ? { ...u, hp } : u)),
        turn: { ...next.turn, acted: true },
      };
      events.push({ type: "attacked", unit: attacker.id, target: target.id, damage });
      if (hp === 0) events.push({ type: "died", unit: target.id });
      break;
    }
    case "endTurn":
      break;
  }

  const result = matchResult(next);
  if (result) {
    events.push({ type: "matchEnded", winner: result.winner });
    return { state: { ...next, queue: [], result }, events };
  }
  if (action.type === "endTurn" || (next.turn.moved && next.turn.acted)) {
    next = endTurn(next, events);
  }
  return { state: next, events };
}

function endTurn(state: MatchState, events: GameEvent[]): MatchState {
  const [current, ...rest] = state.queue;
  if (current !== undefined) events.push({ type: "turnEnded", unit: current });

  const aliveIds = new Set(state.units.filter((u) => u.hp > 0).map((u) => u.id));
  let queue = rest.filter((id) => aliveIds.has(id));
  let round = state.round;
  if (queue.length === 0) {
    round++;
    queue = initiativeOrder(state.units);
    events.push({ type: "roundStarted", round });
  }
  events.push({ type: "turnStarted", unit: queue[0] as string });
  return { ...state, round, queue, turn: { moved: false, acted: false } };
}

/** The match is over when at most one team has living units. */
function matchResult(state: MatchState): { winner: Team | null } | null {
  const teams = new Set(state.units.filter((u) => u.hp > 0).map((u) => u.team));
  if (teams.size > 1) return null;
  const [winner = null] = teams;
  return { winner };
}

/** Living units, highest initiative first. Ties keep setup order. */
function initiativeOrder(units: readonly Unit[]): string[] {
  return units
    .filter((u) => u.hp > 0)
    .map((u, index) => ({ u, index }))
    .sort((a, b) => b.u.initiative - a.u.initiative || a.index - b.index)
    .map(({ u }) => u.id);
}

export interface Outcome {
  readonly state: MatchState;
  readonly events: readonly GameEvent[];
  /** hp lost (negative) or gained (positive) per unit, only units that changed. */
  readonly hpChanges: readonly { readonly unit: string; readonly delta: number }[];
  readonly deaths: readonly string[];
}

/**
 * What an action would do, for previews in the client and for bots. It is
 * apply on the same state, never a separate calculation, so a preview cannot
 * disagree with the real outcome.
 */
export function preview(state: MatchState, action: Action): Outcome {
  const { state: next, events } = apply(state, action);
  const hpChanges = next.units.flatMap((u, i) => {
    const delta = u.hp - (state.units[i] as Unit).hp;
    return delta === 0 ? [] : [{ unit: u.id, delta }];
  });
  const deaths = events.flatMap((e) => (e.type === "died" ? [e.unit] : []));
  return { state: next, events, hpChanges, deaths };
}
