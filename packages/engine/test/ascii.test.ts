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
    expect(tileAt(map, { x: 1, y: 0 })).toEqual({
      height: 2,
      terrain: "stone",
      object: null,
      surface: null,
    });
    expect(tileAt(map, { x: 2, y: 0 })?.terrain).toBe("water");
    expect(tileAt(map, { x: 0, y: 1 })).toEqual({
      height: 3,
      terrain: "stone",
      object: "pillar",
      surface: null,
    });
    expect(units).toEqual([
      { id: "a", team: 0, x: 0, y: 0 },
      { id: "B", team: 1, x: 1, y: 1 },
    ]);
  });

  it("reads per-unit stats", () => {
    const { units } = parseScenario(`
      map:
      1g 1g
      units:
      a  B
      stats:
      B  range=4 attack=20
    `);
    expect(units[1]).toEqual({ id: "B", team: 1, x: 1, y: 0, range: 4, attack: 20 });
  });

  it.each([
    ["an unknown unit", "x range=4"],
    ["an unknown stat", "a speed=4"],
    ["a malformed stat", "a range=far"],
  ])("rejects stats for %s", (_, line) => {
    expect(() => parseScenario(`map:\n1g 1g\nunits:\na B\nstats:\n${line}`)).toThrow(SyntaxError);
  });

  it("reads surfaces and abilities", () => {
    const { map, units } = parseScenario(`
      map:
      1g+p 1g+W 1g+e
      units:
      a  .  B
      stats:
      a  abilities=fireball,iceWall range=2
    `);
    expect(tileAt(map, { x: 0, y: 0 })?.surface).toEqual({ kind: "puddle", rounds: null });
    expect(tileAt(map, { x: 1, y: 0 })?.surface).toEqual({ kind: "iceWall", rounds: 3 });
    expect(tileAt(map, { x: 2, y: 0 })?.surface).toEqual({ kind: "electrified", rounds: 1 });
    expect(units[0]).toMatchObject({ abilities: ["fireball", "iceWall"], range: 2 });
  });

  it("rejects unknown abilities", () => {
    expect(() => parseScenario("map:\n1g 1g\nunits:\na B\nstats:\na abilities=nope")).toThrow(
      SyntaxError,
    );
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
