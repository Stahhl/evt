import { createMatch, parseScenario } from "@evt/engine";
import { describe, expect, it } from "vitest";
import { turnOptions } from "./options.ts";

const state = createMatch({
  ...parseScenario(`
    map:
    1g 1g 1g
    1g 1g 1g
    units:
    a  B  .
    .  .  .
  `),
  seed: 1,
});

describe("turnOptions", () => {
  it("lists moves with paths and attacks by target tile for the local team", () => {
    const options = turnOptions(state, [0]);
    // (2,0) is reached around B in four steps.
    expect([...options.moves.keys()]).toEqual(["2,0", "0,1", "1,1", "2,1"]);
    expect(options.moves.get("2,1")).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(options.attacks.get("1,0")).toEqual({
      type: "attack",
      unit: "a",
      target: { x: 1, y: 0 },
    });
  });

  it("is empty when the active unit belongs to someone else", () => {
    const options = turnOptions(state, [1]);
    expect(options.moves.size).toBe(0);
    expect(options.attacks.size).toBe(0);
  });
});
