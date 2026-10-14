import { describe, expect, it } from "vitest";
import {
  type Action,
  activeUnit,
  apply,
  type GameEvent,
  IllegalActionError,
  legalActions,
  type MatchState,
  preview,
  tileAt,
} from "../src/index.ts";
import { hp, play, scenario } from "./helpers.ts";

const at = (x: number, y: number) => ({ x, y });
const surface = (s: MatchState, x: number, y: number) =>
  tileAt(s.map, { x, y })?.surface?.kind ?? null;
const cast = (unit: string, ability: string, x: number, y: number) =>
  ({ type: "ability", unit, ability, target: at(x, y) }) as Action;
const end = (unit: string): Action => ({ type: "endTurn", unit });

describe("acceptance: combo chain (issue #5)", () => {
  /**
   * Four casters act first. The ice wall goes up between the enemies, the
   * fireball melts it so both stand in water, chain lightning electrifies
   * the water and quick freeze turns it to ice with the enemies frozen in it.
   */
  const COMBO = `
    map:
    1g 1g 1g 1g 1g 1g 1g
    1g 1g 1g 1g 1g 1g 1g
    1g 1g 1g 1g 1g 1g 1g
    units:
    .  w  f  l  .  q  .
    .  .  .  A  .  B  .
    .  .  .  .  .  .  .
    stats:
    w  initiative=20 abilities=iceWall
    f  initiative=19 abilities=fireball
    l  initiative=18 abilities=chainLightning
    q  initiative=17 abilities=quickFreeze
    A  initiative=1
    B  initiative=1
  `;

  it("ice wall, fireball, chain lightning, quick freeze", () => {
    let state = scenario(COMBO);
    const run = (action: Action): GameEvent[] => {
      const result = apply(state, action);
      state = result.state;
      return result.events;
    };

    run(cast("w", "iceWall", 4, 1));
    expect(surface(state, 4, 1)).toBe("iceWall");
    run(end("w"));

    // Fireball melts the wall: water on its tile and the four around it.
    const fire = run(cast("f", "fireball", 4, 1));
    expect(fire).toContainEqual({ type: "damaged", unit: "A", amount: 20, source: "fireball" });
    expect(fire).toContainEqual({ type: "damaged", unit: "B", amount: 20, source: "fireball" });
    for (const [x, y] of [
      [4, 1],
      [4, 0],
      [3, 1],
      [5, 1],
      [4, 2],
    ] as const) {
      expect(surface(state, x, y), `(${x},${y})`).toBe("puddle");
    }
    run(end("f"));

    // Lightning hits A, conducts through the water to A and B, jumps to B.
    const bolt = run(cast("l", "chainLightning", 3, 1));
    expect(bolt.filter((e) => e.type === "damaged")).toEqual([
      { type: "damaged", unit: "A", amount: 20, source: "chainLightning" },
      { type: "damaged", unit: "A", amount: 15, source: "conduction" },
      { type: "damaged", unit: "B", amount: 15, source: "conduction" },
      { type: "damaged", unit: "B", amount: 20, source: "chainLightning" },
    ]);
    expect(surface(state, 4, 1)).toBe("electrified");
    run(end("l"));

    // Quick freeze turns the electrified water to ice and freezes both.
    const freeze = run(cast("q", "quickFreeze", 4, 1));
    expect(freeze).toContainEqual({ type: "frozen", unit: "A", turns: 1 });
    expect(freeze).toContainEqual({ type: "frozen", unit: "B", turns: 1 });
    expect(surface(state, 3, 1)).toBe("ice");
    expect(hp(state, "A")).toBe(100 - 20 - 20 - 15 - 10);
    expect(hp(state, "B")).toBe(100 - 20 - 15 - 20 - 10);

    // Both enemies skip their turns; the round ends and w acts again.
    const skipped = run(end("q"));
    expect(skipped.filter((e) => e.type === "turnSkipped")).toEqual([
      { type: "turnSkipped", unit: "A" },
      { type: "turnSkipped", unit: "B" },
    ]);
    expect(activeUnit(state)?.id).toBe("w");
    expect(state.round).toBe(2);
  });
});

describe("abilities", () => {
  const DUEL = `
    map:
    1g 1g 1g 1g 1g
    1g 1g 1g 1g 1g
    units:
    a  .  .  .  B
    .  .  .  .  .
    stats:
    a  abilities=fireball,iceWall
  `;

  it("count as the turn's action and go on cooldown", () => {
    const state = play(scenario(DUEL), cast("a", "fireball", 3, 0));
    expect(state.turn.acted).toBe(true);
    expect(legalActions(state, 0).some((a) => a.type === "ability")).toBe(false);
    const unit = state.units.find((u) => u.id === "a");
    expect(unit?.cooldowns).toEqual({ fireball: 2, iceWall: 0 });
  });

  it("count down at the start of each own turn", () => {
    let state = play(scenario(DUEL), cast("a", "fireball", 3, 0), end("a"), end("B"));
    expect(state.units[0]?.cooldowns.fireball).toBe(1);
    expect(() => apply(state, cast("a", "fireball", 3, 0))).toThrow(IllegalActionError);
    state = play(state, end("a"), end("B"));
    expect(state.units[0]?.cooldowns.fireball).toBe(0);
    expect(() => apply(state, cast("a", "fireball", 3, 0))).not.toThrow();
  });

  it("need range, line of sight and a fitting target", () => {
    const state = scenario(DUEL);
    const illegal = (a: Action) => expect(() => apply(state, a)).toThrow(IllegalActionError);
    illegal(cast("a", "fireball", 4, 1)); // 5 away
    illegal(cast("a", "iceWall", 4, 0)); // B stands there
    illegal(cast("a", "chainLightning", 4, 0)); // a does not have it
  });

  it("hit allies too", () => {
    const state = scenario(
      `
      map:
      1g 1g 1g 1g
      units:
      a  b  C  .
      stats:
      a  abilities=fireball
    `,
    );
    const { events } = apply(state, cast("a", "fireball", 2, 0));
    expect(events.filter((e) => e.type === "damaged").map((e) => e.unit)).toEqual(["b", "C"]);
  });

  it("end the caster's turn if it kills itself", () => {
    const state = scenario(DUEL, { a: { maxHp: 20 } });
    const { state: next, events } = apply(state, cast("a", "fireball", 1, 0));
    expect(events).toContainEqual({ type: "died", unit: "a" });
    expect(next.result).toEqual({ winner: 1 });
  });

  it("ice walls block movement and sight, then melt into a puddle", () => {
    const LANE = `
      map:
      1g 1g 1g 1g 1g
      units:
      a  .  .  .  B
      stats:
      a  abilities=iceWall
      B  range=4
    `;
    let state = play(scenario(LANE), cast("a", "iceWall", 2, 0));
    expect(legalActions(state, 0).some((a) => a.type === "move" && a.to.x > 2)).toBe(false);
    state = play(state, end("a"));
    // B's arrow cannot reach a through the wall.
    expect(legalActions(state, 1).some((a) => a.type === "attack")).toBe(false);
    state = play(state, end("B"), end("a"), end("B"), end("a"), end("B"));
    expect(state.round).toBe(4);
    expect(surface(state, 2, 0)).toBe("puddle");
  });
});

describe("surfaces", () => {
  it("fire turns a puddle into steam that clears after two rounds", () => {
    let state = scenario(`
      map:
      1g 1g+p 1g
      units:
      a  .  B
      stats:
      a  abilities=fireball
    `);
    state = play(state, cast("a", "fireball", 1, 0));
    expect(surface(state, 1, 0)).toBe("steam");
    state = play(state, end("a"), end("B"));
    expect(surface(state, 1, 0)).toBe("steam");
    state = play(state, end("a"), end("B"));
    expect(surface(state, 1, 0)).toBeNull();
  });

  it("shocks a unit that ends its turn on an electrified tile", () => {
    const state = scenario(`
      map:
      1g+e 1g 1g
      units:
      a  .  B
    `);
    const { events } = apply(state, end("a"));
    expect(events).toContainEqual({
      type: "damaged",
      unit: "a",
      amount: 10,
      source: "electrified",
    });
  });

  it("frozen ice melts back into a puddle", () => {
    let state = scenario(`
      map:
      1g+i 1g 1g
      units:
      a  .  B
    `);
    state = play(state, end("a"), end("B"), end("a"), end("B"));
    expect(surface(state, 0, 0)).toBe("puddle");
  });

  it("lightning conducts through connected water only", () => {
    const state = scenario(`
      map:
      1g+p 1g+p 1g 1g 1g+p
      units:
      a  B  .  .  C
      stats:
      a  abilities=chainLightning initiative=12
    `);
    const { state: next, events } = apply(state, cast("a", "chainLightning", 1, 0));
    // a stands in the same pool as B and is shocked too. C is out of jump
    // range and its pool is not connected, so it stays a plain puddle.
    const shocked = events.flatMap((e) =>
      e.type === "damaged" && e.source === "conduction" ? [e.unit] : [],
    );
    expect(shocked).toEqual(["a", "B"]);
    expect(surface(next, 4, 0)).toBe("puddle");
    expect(hp(next, "C")).toBe(100);
  });
});

describe("steam dodge", () => {
  const STEAM = `
    map:
    1g 1g+s 1g
    units:
    a  B  .
  `;

  it("previews both outcomes with their odds", () => {
    const { branches } = preview(scenario(STEAM), { type: "attack", unit: "a", target: at(1, 0) });
    expect(branches.map((b) => [b.chance, b.hpChanges])).toEqual([
      [0.5, []],
      [0.5, [{ unit: "B", delta: -30 }]],
    ]);
  });

  it("rolls from the match seed, so a replay repeats it", () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 20; seed++) {
      const state = scenario(STEAM, {}, seed);
      const roll = (s: MatchState) =>
        apply(s, { type: "attack", unit: "a", target: at(1, 0) }).events.find(
          (e) => e.type === "dodge",
        );
      const first = roll(state);
      expect(roll(state)).toEqual(first);
      if (first?.type === "dodge") outcomes.add(first.success);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });
});
