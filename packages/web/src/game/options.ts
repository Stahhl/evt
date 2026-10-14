import {
  type Action,
  activeUnit,
  legalActions,
  type MatchState,
  type Pos,
  reachableTiles,
} from "@evt/engine";

export const posKey = (p: Pos): string => `${p.x},${p.y}`;

export interface TurnOptions {
  /** Tiles the active unit can move to, with the path there. */
  readonly moves: ReadonlyMap<string, readonly Pos[]>;
  /** Attack actions keyed by the target tile. */
  readonly attacks: ReadonlyMap<string, Action>;
}

export const NO_OPTIONS: TurnOptions = { moves: new Map(), attacks: new Map() };

/** What the active unit can do right now, if it belongs to one of these teams. */
export function turnOptions(state: MatchState, teams: readonly number[]): TurnOptions {
  const active = activeUnit(state);
  if (!active || !teams.includes(active.team)) return NO_OPTIONS;
  const legal = legalActions(state, active.team);
  const moves = new Map<string, readonly Pos[]>();
  if (legal.some((a) => a.type === "move")) {
    for (const { to, path } of reachableTiles(state, active)) moves.set(posKey(to), path);
  }
  const attacks = new Map<string, Action>();
  for (const a of legal) if (a.type === "attack") attacks.set(posKey(a.target), a);
  return { moves, attacks };
}
