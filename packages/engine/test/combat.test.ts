import { describe, expect, it } from "vitest";
import {
  type Action,
  activeUnit,
  apply,
  IllegalActionError,
  legalActions,
  type MatchState,
  preview,
} from "../src/index.ts";
import { deepFreeze, hp, play, scenario } from "./helpers.ts";

const at = (x: number, y: number) => ({ x, y });

function illegal(state: MatchState, action: Action) {
  expect(() => apply(state, action)).toThrow(IllegalActionError);
}

function targets(state: MatchState): string[] {
  const active = activeUnit(state);
  if (!active) return [];
  return legalActions(state, active.team).flatMap((a) =>
    a.type === "attack" ? [`${a.target.x},${a.target.y}`] : [],
  );
}

const ADJACENT = `
  map:
  1g 1g 1g
  1g 1g 1g
  units:
  a  B  .
  .  .  .
`;

describe("basic attack", () => {
  it("damages an adjacent enemy", () => {
    const { state, events } = apply(scenario(ADJACENT), {
      type: "attack",
      unit: "a",
      target: at(1, 0),
    });
    expect(events).toEqual([{ type: "attacked", unit: "a", target: "B", damage: 30 }]);
    expect(hp(state, "B")).toBe(70);
    expect(state.turn).toEqual({ moved: false, acted: true });
    expect(activeUnit(state)?.id).toBe("a");
  });

  it("can come after the move, and the turn ends when both are done", () => {
    const moved = play(scenario(ADJACENT), { type: "move", unit: "a", to: at(1, 1) });
    const { events } = apply(moved, { type: "attack", unit: "a", target: at(1, 0) });
    expect(events.map((e) => e.type)).toEqual(["attacked", "turnEnded", "turnStarted"]);
  });

  it("can come before the move", () => {
    const attacked = play(scenario(ADJACENT), { type: "attack", unit: "a", target: at(1, 0) });
    const { state, events } = apply(attacked, { type: "move", unit: "a", to: at(0, 1) });
    expect(events.map((e) => e.type)).toEqual(["moved", "turnEnded", "turnStarted"]);
    expect(activeUnit(state)?.id).toBe("B");
  });

  it("rejects attacks that are out of reach or on the wrong tile", () => {
    const state = scenario(`
      map:
      1g 1g 1g 1g
      units:
      a  b  .  C
    `);
    illegal(state, { type: "attack", unit: "a", target: at(3, 0) }); // out of range
    illegal(state, { type: "attack", unit: "a", target: at(1, 0) }); // ally
    illegal(state, { type: "attack", unit: "a", target: at(2, 0) }); // empty
    illegal(state, { type: "attack", unit: "b", target: at(3, 0) }); // not b's turn
  });

  it("only attacks once per turn", () => {
    const attacked = play(scenario(ADJACENT), { type: "attack", unit: "a", target: at(1, 0) });
    illegal(attacked, { type: "attack", unit: "a", target: at(1, 0) });
    expect(targets(attacked)).toEqual([]);
  });

  it("needs line of sight and range for ranged attacks", () => {
    const state = scenario(
      `
      map:
      1g 1g 2s 1g 1g
      1g 1g 1g 1g 1g
      units:
      a  .  .  .  B
      .  .  .  .  C
    `,
      { a: { range: 4 } },
    );
    // B is 4 away behind a raised tile; C is 5 away in the open.
    expect(targets(state)).toEqual([]);
    const moved = play(state, { type: "move", unit: "a", to: at(0, 1) });
    // From (0,1): B at distance 5, C at distance 4 with a clear line.
    expect(targets(moved)).toEqual(["4,1"]);
  });
});

describe("height", () => {
  const damage = (map: string) => {
    const state = scenario(`map:\n${map}\nunits:\na B`);
    return apply(state, { type: "attack", unit: "a", target: at(1, 0) }).events[0];
  };

  it("adds 10% per block above the target and removes 10% per block below", () => {
    expect(damage("2s 1g")).toMatchObject({ damage: 33 });
    expect(damage("1g 2s")).toMatchObject({ damage: 27 });
    expect(damage("1g 1g")).toMatchObject({ damage: 30 });
  });

  it("caps at three blocks", () => {
    expect(damage("9s 1g")).toMatchObject({ damage: 39 });
    expect(damage("1g 9s")).toMatchObject({ damage: 21 });
  });
});

describe("death", () => {
  it("removes a killed unit from the round and ends the match when its team is gone", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g
      units:
      a  B  C
    `,
      { B: { maxHp: 20 } },
    );
    const { state: afterKill, events } = apply(state, {
      type: "attack",
      unit: "a",
      target: at(1, 0),
    });
    expect(events).toEqual([
      { type: "attacked", unit: "a", target: "B", damage: 20 },
      { type: "died", unit: "B" },
    ]);
    expect(hp(afterKill, "B")).toBe(0);
    expect(afterKill.result).toBeNull();

    const next = play(afterKill, { type: "endTurn", unit: "a" });
    expect(activeUnit(next)?.id).toBe("C"); // B is skipped
    // The dead unit's tile is free again.
    expect(legalActions(next, 1)).toContainEqual({ type: "move", unit: "C", to: at(1, 0) });
  });

  it("ends the match when the last enemy dies", () => {
    const state = scenario(ADJACENT, { B: { maxHp: 30 } });
    const { state: next, events } = apply(state, { type: "attack", unit: "a", target: at(1, 0) });
    expect(events.map((e) => e.type)).toEqual(["attacked", "died", "matchEnded"]);
    expect(next.result).toEqual({ winner: 0 });
  });
});

describe("preview", () => {
  it("matches apply exactly and summarises the changes", () => {
    const state = deepFreeze(scenario(ADJACENT, { B: { maxHp: 25 } }));
    const action: Action = { type: "attack", unit: "a", target: at(1, 0) };
    const outcome = preview(state, action);
    expect(outcome.state).toEqual(apply(state, action).state);
    expect(outcome.hpChanges).toEqual([{ unit: "B", delta: -25 }]);
    expect(outcome.deaths).toEqual(["B"]);
  });

  it("has no hp changes for a move", () => {
    const outcome = preview(scenario(ADJACENT), { type: "move", unit: "a", to: at(0, 1) });
    expect(outcome.hpChanges).toEqual([]);
    expect(outcome.deaths).toEqual([]);
  });
});
