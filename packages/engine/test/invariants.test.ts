import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Action,
  activeUnit,
  apply,
  createMatch,
  hashState,
  isStandable,
  legalActions,
  MAPS,
  type MatchState,
  parseScenario,
  tileAt,
} from "../src/index.ts";
import { deepFreeze } from "./helpers.ts";

const SMALL = parseScenario(`
  map:
  1g 2s 1g 1g 1g
  1g 0w 1g 3sP 2s
  0g 1g 2s 1g 1g
  units:
  a  .  .  .  B
  c  .  .  .  .
  .  .  .  .  D
  stats:
  c  range=3 attack=40
  D  range=3 attack=40
`);
const SKIRMISH = parseScenario(MAPS.skirmish as string);

function checkInvariants(state: MatchState): void {
  const living = state.units.filter((u) => u.hp > 0);
  const tiles = new Set(living.map((u) => `${u.x},${u.y}`));
  expect(tiles.size, "two living units share a tile").toBe(living.length);
  for (const u of state.units) {
    expect(u.hp).toBeGreaterThanOrEqual(0);
    expect(u.hp).toBeLessThanOrEqual(u.maxHp);
  }
  for (const u of living) {
    const tile = tileAt(state.map, u);
    expect(tile && isStandable(tile), `${u.id} stands on an unstandable tile`).toBe(true);
  }
  for (const id of state.queue) {
    expect(
      living.some((u) => u.id === id),
      `dead unit ${id} in the queue`,
    ).toBe(true);
  }
  expect(state.round).toBeLessThanOrEqual(state.maxRounds);
  if (state.result) {
    expect(state.queue).toEqual([]);
  } else {
    expect(activeUnit(state)).toBeDefined();
    expect(new Set(living.map((u) => u.team)).size).toBeGreaterThan(1);
  }
  expect(hashState(state)).toMatch(/^[0-9a-f]{16}$/);
}

/** Plays a match by picking legal actions with the given choices until it ends. */
function playOut(state: MatchState, choices: readonly number[]): MatchState {
  for (let i = 0; !state.result; i++) {
    const team = activeUnit(state)?.team ?? 0;
    const legal = legalActions(state, team);
    expect(legal.length, "an active unit always has an action").toBeGreaterThan(0);
    expect(legalActions(state, 1 - team)).toEqual([]);
    const action = legal[(choices[i % choices.length] ?? 0) % legal.length] as Action;
    state = apply(deepFreeze(state), action).state;
    checkInvariants(state);
  }
  return state;
}

describe("invariants under random legal play", () => {
  const match = fc.record({
    setup: fc.constantFrom(SMALL, SKIRMISH),
    seed: fc.integer(),
    maxRounds: fc.integer({ min: 1, max: 8 }),
    // Choices are indices into the legal actions; they wrap around.
    choices: fc.array(fc.nat(), { minLength: 1, maxLength: 64 }),
  });

  it("hold after every action, and every match ends", () => {
    fc.assert(
      fc.property(match, ({ setup, seed, maxRounds, choices }) => {
        const start = createMatch({ ...setup, seed, maxRounds });
        checkInvariants(start);
        const end = playOut(start, choices);
        expect(end.result).not.toBeNull();
      }),
      { numRuns: 60 },
    );
  });

  it("are deterministic: the same choices give the same hash", () => {
    fc.assert(
      fc.property(match, ({ setup, seed, maxRounds, choices }) => {
        const a = playOut(createMatch({ ...setup, seed, maxRounds }), choices);
        const b = playOut(createMatch({ ...setup, seed, maxRounds }), choices);
        expect(hashState(a)).toBe(hashState(b));
      }),
      { numRuns: 20 },
    );
  });
});
