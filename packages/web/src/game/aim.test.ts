import { createMatch, parseScenario } from "@evt/engine";
import { describe, expect, it } from "vitest";
import { aimAction, aimTiles, canAim, defaultAim, firstTarget } from "./aim.ts";
import { turnOptions } from "./options.ts";

const state = createMatch({
  ...parseScenario(`
    map:
    1g 1g 1g 1g
    1g 1g 1g 1g
    units:
    a  B  .  .
    .  .  .  .
  `),
  seed: 1,
});
const options = turnOptions(state, [0]);
const a = { x: 0, y: 0 };

describe("aim", () => {
  it("starts with a move and puts the crosshair on the unit", () => {
    expect(defaultAim(options)).toBe("move");
    expect(firstTarget(options, "move", a)).toEqual(a);
  });

  it("turns a move tile into a move and the enemy into an attack", () => {
    expect(aimAction(options, "move", "a", { x: 0, y: 1 })).toEqual({
      type: "move",
      unit: "a",
      to: { x: 0, y: 1 },
    });
    expect(aimAction(options, "move", "a", { x: 1, y: 0 })).toBeNull();
    expect(aimAction(options, "attack", "a", { x: 1, y: 0 })).toMatchObject({ type: "attack" });
    expect(aimAction(options, "attack", "a", { x: 0, y: 1 })).toBeNull();
  });

  it("aims an attack at the nearest enemy", () => {
    expect(canAim(options, "attack")).toBe(true);
    expect(aimTiles(options, "attack")).toEqual([{ x: 1, y: 0 }]);
    expect(firstTarget(options, "attack", a)).toEqual({ x: 1, y: 0 });
  });

  it("falls back to attacking once the unit has moved", () => {
    const moved = { ...options, moves: new Map() };
    expect(canAim(moved, "move")).toBe(false);
    expect(defaultAim(moved)).toBe("attack");
    expect(defaultAim({ ...moved, attacks: new Map() })).toBeNull();
  });
});
