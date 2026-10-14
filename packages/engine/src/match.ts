import { inBounds, isStandable, samePos, tileAt } from "./map.ts";
import { reachableTiles } from "./movement.ts";
import { seedRng } from "./rng.ts";
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
export const DEFAULT_STATS: UnitStats = { maxHp: 100, move: 4, jump: 1, initiative: 10 };

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
