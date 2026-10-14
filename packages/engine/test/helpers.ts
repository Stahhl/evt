import {
  type Action,
  apply,
  createMatch,
  type MatchState,
  parseScenario,
  type UnitSetup,
} from "../src/index.ts";

export function scenario(text: string, stats: Record<string, Partial<UnitSetup>> = {}): MatchState {
  const { map, units } = parseScenario(text);
  return createMatch({ map, units: units.map((u) => ({ ...u, ...stats[u.id] })), seed: 1 });
}

/** Strict-mode code throws if apply tries to modify a frozen state. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export function play(state: MatchState, ...actions: Action[]): MatchState {
  return actions.reduce((s, a) => apply(deepFreeze(s), a).state, state);
}

export function hp(state: MatchState, id: string): number | undefined {
  return state.units.find((u) => u.id === id)?.hp;
}
