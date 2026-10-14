import { describe, expect, it } from "vitest";
import {
  type Action,
  activeUnit,
  apply,
  createMatch,
  hashState,
  IllegalActionError,
  legalActions,
  type MatchState,
  parseScenario,
  type UnitSetup,
} from "../src/index.ts";

function scenario(text: string, stats: Record<string, Partial<UnitSetup>> = {}): MatchState {
  const { map, units } = parseScenario(text);
  return createMatch({ map, units: units.map((u) => ({ ...u, ...stats[u.id] })), seed: 1 });
}

/** Strict-mode code throws if apply tries to modify a frozen state. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function play(state: MatchState, ...actions: Action[]): MatchState {
  return actions.reduce((s, a) => apply(deepFreeze(s), a).state, state);
}

function destinations(state: MatchState): string[] {
  const active = activeUnit(state);
  if (!active) return [];
  return legalActions(state, active.team).flatMap((a) =>
    a.type === "move" ? [`${a.to.x},${a.to.y}`] : [],
  );
}

const DUEL = `
  map:
  1g 1g 1g 1g 1g
  1g 1g 1g 1g 1g
  units:
  a  .  .  .  B
  .  .  .  .  .
`;

describe("acceptance: issue #1", () => {
  it("moves a unit across an ASCII map and hands the turn to the next player", () => {
    let state = scenario(DUEL, { a: { initiative: 12 } });
    expect(activeUnit(state)?.id).toBe("a");

    const moved = apply(state, { type: "move", unit: "a", to: { x: 2, y: 1 } });
    expect(moved.events).toEqual([
      {
        type: "moved",
        unit: "a",
        path: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
        ],
      },
    ]);
    state = moved.state;
    expect(state.units.find((u) => u.id === "a")).toMatchObject({ x: 2, y: 1 });

    const ended = apply(state, { type: "endTurn", unit: "a" });
    expect(ended.events).toEqual([
      { type: "turnEnded", unit: "a" },
      { type: "turnStarted", unit: "B" },
    ]);
    expect(activeUnit(ended.state)?.team).toBe(1);
  });
});

describe("createMatch", () => {
  it("orders the round by initiative, ties in setup order", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g 1g
      units:
      a  B  c  D
    `,
      { c: { initiative: 15 }, D: { initiative: 5 } },
    );
    expect(state.queue).toEqual(["c", "a", "B", "D"]);
    expect(state.round).toBe(1);
    expect(state.units[0]).toMatchObject({ hp: 100, maxHp: 100, move: 4, jump: 1 });
  });

  it.each([
    ["one team", "map:\n1g 1g\nunits:\na b"],
    ["a unit in water", "map:\n1g 1w\nunits:\na B"],
    ["a unit on a pillar", "map:\n1g 1gP\nunits:\na B"],
  ])("rejects %s", (_, text) => {
    expect(() => scenario(text)).toThrow(RangeError);
  });

  it("rejects bad unit setups", () => {
    const { map } = parseScenario("map:\n1g 1g");
    const a = { id: "a", team: 0, x: 0, y: 0 };
    const b = { id: "b", team: 1, x: 1, y: 0 };
    expect(() => createMatch({ map, units: [a, { ...b, id: "a" }], seed: 1 })).toThrow(/duplicate/);
    expect(() => createMatch({ map, units: [a, { ...b, x: 0 }], seed: 1 })).toThrow(/share/);
    expect(() => createMatch({ map, units: [a, { ...b, x: 5 }], seed: 1 })).toThrow(/stand/);
  });
});

describe("movement", () => {
  it("is limited by move", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g 1g
      units:
      a  .  .  B
    `,
      { a: { move: 1 } },
    );
    expect(destinations(state)).toEqual(["1,0"]);
  });

  it("cannot climb or drop more than jump", () => {
    const climb = scenario(`
      map:
      1g 2g 4g
      0g 1g 3g
      1g 1g 1g
      units:
      a  .  .
      .  .  .
      .  .  B
    `);
    // (2,0) and (2,1) are 2 above every neighbour a can reach.
    expect(destinations(climb)).toEqual(["1,0", "0,1", "1,1", "0,2", "1,2"]);

    const drop = scenario(`
      map:
      3g 2g 0g 0g
      units:
      a  .  .  B
    `);
    expect(destinations(drop)).toEqual(["1,0"]);
  });

  it("is blocked by water and pillars", () => {
    const state = scenario(`
      map:
      1g 1w 1g
      1g 1gP 1g
      1g 1g 1g
      units:
      a  .  .
      .  .  .
      .  .  B
    `);
    expect(destinations(state)).toEqual(["0,1", "0,2", "1,2"]);
  });

  it("passes through allies but not enemies, and never stops on a unit", () => {
    const state = scenario(`
      map:
      1g 1g 1g 1g 1g
      1g 1g 1g 1g 1g
      units:
      a  b  .  C  .
      .  .  .  .  .
    `);
    const reachable = destinations(state);
    expect(reachable).toContain("2,0"); // through ally b
    expect(reachable).not.toContain("1,0"); // b stands there
    expect(reachable).not.toContain("4,0"); // only reachable through C in 4 steps
  });
});

describe("apply", () => {
  it("rejects illegal actions", () => {
    const state = scenario(DUEL);
    const illegal = (s: MatchState, a: Action) =>
      expect(() => apply(s, a)).toThrow(IllegalActionError);

    illegal(state, { type: "endTurn", unit: "B" });
    illegal(state, { type: "move", unit: "a", to: { x: 4, y: 1 } });
    illegal(state, { type: "move", unit: "a", to: { x: -1, y: 0 } });
    illegal(state, { type: "move", unit: "a", to: { x: 0, y: 0 } });
    const moved = play(state, { type: "move", unit: "a", to: { x: 1, y: 0 } });
    illegal(moved, { type: "move", unit: "a", to: { x: 2, y: 0 } });
  });

  it("starts a new round when everyone has acted", () => {
    const state = scenario(DUEL);
    const afterA = play(state, { type: "endTurn", unit: "a" });
    const { state: next, events } = apply(afterA, { type: "endTurn", unit: "B" });
    expect(events).toEqual([
      { type: "turnEnded", unit: "B" },
      { type: "roundStarted", round: 2 },
      { type: "turnStarted", unit: "a" },
    ]);
    expect(next.round).toBe(2);
    expect(next.queue).toEqual(["a", "B"]);
  });

  it("ends the match when one team has no living units", () => {
    // Nothing deals damage until #2, so kill B by hand.
    const state = scenario(DUEL);
    const doomed = {
      ...state,
      units: state.units.map((u) => (u.id === "B" ? { ...u, hp: 0 } : u)),
    };
    const { state: next, events } = apply(doomed, { type: "endTurn", unit: "a" });
    expect(events).toEqual([{ type: "matchEnded", winner: 0 }]);
    expect(next.result).toEqual({ winner: 0 });
    expect(activeUnit(next)).toBeUndefined();
    expect(legalActions(next, 0)).toEqual([]);
    expect(() => apply(next, { type: "endTurn", unit: "a" })).toThrow(IllegalActionError);
  });
});

describe("legalActions", () => {
  it("is empty for the team that is not active", () => {
    expect(legalActions(scenario(DUEL), 1)).toEqual([]);
  });

  it("only offers actions that apply accepts, and every state hashes", () => {
    let state = scenario(`
      map:
      1g 2s 2s 1g
      1g 0w 3sP 1g
      0g 1g 2g 1g
      units:
      a  .  .  B
      c  .  .  .
      .  .  .  D
    `);
    for (let step = 0; step < 40; step++) {
      const team = activeUnit(state)?.team ?? 0;
      const actions = legalActions(state, team);
      for (const action of actions) expect(() => apply(state, action)).not.toThrow();
      // Cycle through the options so the walk visits many positions.
      state = play(state, actions[step % actions.length] as Action);
      expect(hashState(state)).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(state.round).toBeGreaterThan(2);
  });
});
