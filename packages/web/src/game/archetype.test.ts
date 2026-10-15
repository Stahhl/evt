import { createMatch, MAPS, parseScenario } from "@evt/engine";
import { describe, expect, it } from "vitest";
import { archetypeOf } from "./archetype.ts";

describe("archetypeOf", () => {
  it("tells the four characters of highlands apart", () => {
    const state = createMatch({ ...parseScenario(MAPS.highlands ?? ""), seed: 1 });
    const kinds = Object.fromEntries(state.units.map((u) => [u.id, archetypeOf(u)]));
    expect(kinds).toMatchObject({
      a: "knight",
      A: "knight",
      b: "archer",
      c: "scout",
      d: "warden",
      D: "warden",
    });
  });
});
