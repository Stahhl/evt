import { describe, expect, it } from "vitest";
import { posIndex, threatenedTiles } from "../src/index.ts";
import { scenario } from "./helpers.ts";

describe("threatenedTiles", () => {
  it("covers where an enemy can walk and then hit", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g 1g 1g 1g 1g 1g
      units:
      a  .  .  .  .  .  .  B
    `,
      { B: { move: 2, range: 1 } },
    );
    const threats = threatenedTiles(state, 0);
    // B reaches x=5 and hits one further: x=4..7 minus nothing.
    const xs = [...threats.keys()].map((i) => i % 8).sort((a, b) => a - b);
    expect(xs).toEqual([4, 5, 6, 7]);
    expect(threats.get(posIndex(state.map, { x: 4, y: 0 }))).toEqual(["B"]);
  });

  it("respects line of sight from where the enemy can stand", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g 9s 1g 1g
      units:
      a  .  .  .  .  B
    `,
      { B: { move: 1, range: 4 } },
    );
    const xs = [...threatenedTiles(state, 0).keys()].map((i) => i % 6);
    expect(xs).not.toContain(0);
    expect(xs).not.toContain(2);
  });

  it("ignores the team's own units", () => {
    const state = scenario("map:\n1g 1g\nunits:\na B");
    expect(threatenedTiles(state, 0).size).toBeGreaterThan(0);
    expect([...threatenedTiles(state, 0).values()].flat()).toEqual(["B", "B"]);
  });
});
