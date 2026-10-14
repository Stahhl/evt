import { describe, expect, it } from "vitest";
import { parseScenario, tileAt } from "../src/index.ts";

describe("parseScenario", () => {
  it("reads tiles and units", () => {
    const { map, units } = parseScenario(`
      map:
      1g 2s 0w
      3sP 1g 1g
      units:
      a . .
      . B .
    `);
    expect([map.cols, map.rows]).toEqual([3, 2]);
    expect(tileAt(map, { x: 1, y: 0 })).toEqual({ height: 2, terrain: "stone", object: null });
    expect(tileAt(map, { x: 2, y: 0 })?.terrain).toBe("water");
    expect(tileAt(map, { x: 0, y: 1 })).toEqual({ height: 3, terrain: "stone", object: "pillar" });
    expect(units).toEqual([
      { id: "a", team: 0, x: 0, y: 0 },
      { id: "B", team: 1, x: 1, y: 1 },
    ]);
  });

  it("allows a map without units", () => {
    expect(parseScenario("map:\n1g 1g").units).toEqual([]);
  });

  it.each([
    ["no map", "units:\na"],
    ["ragged map", "map:\n1g 1g\n1g"],
    ["bad tile", "map:\n1x"],
    ["units grid of the wrong size", "map:\n1g 1g\nunits:\na"],
    ["bad unit", "map:\n1g\nunits:\n1"],
    ["duplicate unit", "map:\n1g 1g\nunits:\na a"],
    ["text before a section", "1g\nmap:\n1g"],
  ])("rejects %s", (_, text) => {
    expect(() => parseScenario(text)).toThrow(SyntaxError);
  });
});
