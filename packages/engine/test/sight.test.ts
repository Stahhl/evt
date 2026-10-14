import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type GameMap, hasLineOfSight, parseScenario, type Tile } from "../src/index.ts";

function sees(rows: string, from: [number, number], to: [number, number]): boolean {
  const { map } = parseScenario(`map:\n${rows}`);
  return hasLineOfSight(map, { x: from[0], y: from[1] }, { x: to[0], y: to[1] });
}

describe("hasLineOfSight", () => {
  it("sees across flat ground", () => {
    expect(sees("1g 1g 1g 1g 1g", [0, 0], [4, 0])).toBe(true);
  });

  it("is blocked by a raised tile between units on the same height", () => {
    expect(sees("1g 1g 2s 1g 1g", [0, 0], [4, 0])).toBe(false);
  });

  it("sees over a raised tile from high ground", () => {
    expect(sees("3s 1g 2s 1g 1g", [0, 0], [4, 0])).toBe(true);
  });

  it("cannot see a target behind a cliff edge, but can see one standing on the edge", () => {
    expect(sees("1g 1g 3s 3s", [0, 0], [3, 0])).toBe(false);
    expect(sees("1g 1g 3s 3s", [0, 0], [2, 0])).toBe(true);
  });

  it("treats a pillar as two blocks taller than its tile", () => {
    expect(sees("1g 1gP 1g", [0, 0], [2, 0])).toBe(false);
    expect(sees("4s 1gP 1g", [0, 0], [2, 0])).toBe(false);
    expect(sees("4s 1gP 1g 1g 1g", [0, 0], [4, 0])).toBe(true);
  });

  it("passes exactly through corners", () => {
    const corners = `
      1g 9s 1g
      9s 1g 1g
      1g 1g 1g`;
    expect(sees(corners, [0, 0], [2, 2])).toBe(true);
    expect(sees("1g 1g 1g\n1g 9s 1g\n1g 1g 1g", [0, 0], [2, 2])).toBe(false);
  });

  it("checks every tile a diagonal line crosses", () => {
    // From (0,0) to (2,1) the line crosses (1,0) and (1,1).
    expect(sees("1g 9s 1g\n1g 1g 1g", [0, 0], [2, 1])).toBe(false);
    expect(sees("1g 1g 1g\n1g 9s 1g", [0, 0], [2, 1])).toBe(false);
    expect(sees("1g 1g 1g\n1g 1g 1g", [0, 0], [2, 1])).toBe(true);
  });

  const tile: fc.Arbitrary<Tile> = fc.record({
    height: fc.integer({ min: 0, max: 6 }),
    terrain: fc.constantFrom("stone", "grass", "water"),
    object: fc.constantFrom(null, "pillar"),
  });
  const mapWithTwoTiles = fc
    .record({ cols: fc.integer({ min: 1, max: 8 }), rows: fc.integer({ min: 1, max: 8 }) })
    .chain(({ cols, rows }) =>
      fc.record({
        map: fc
          .array(tile, { minLength: cols * rows, maxLength: cols * rows })
          .map((tiles): GameMap => ({ cols, rows, tiles })),
        a: fc.record({ x: fc.nat(cols - 1), y: fc.nat(rows - 1) }),
        b: fc.record({ x: fc.nat(cols - 1), y: fc.nat(rows - 1) }),
      }),
    );

  it("is symmetric", () => {
    fc.assert(
      fc.property(mapWithTwoTiles, ({ map, a, b }) => {
        expect(hasLineOfSight(map, a, b)).toBe(hasLineOfSight(map, b, a));
      }),
    );
  });

  it("always sees neighbours and itself", () => {
    fc.assert(
      fc.property(mapWithTwoTiles, ({ map, a, b }) => {
        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1) {
          expect(hasLineOfSight(map, a, b)).toBe(true);
        }
      }),
    );
  });
});
