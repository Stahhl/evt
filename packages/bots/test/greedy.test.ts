import {
  type Action,
  activeUnit,
  apply,
  createMatch,
  distance,
  legalActions,
  MAPS,
  type MatchState,
  parseScenario,
} from "@evt/engine";
import { describe, expect, it } from "vitest";
import { type Bot, greedyBot, randomBot } from "../src/index.ts";

function scenario(text: string): MatchState {
  return createMatch({ ...parseScenario(text), seed: 1 });
}

function playMatch(bots: readonly Bot[], seed: number): MatchState {
  let state = createMatch({ ...parseScenario(MAPS.skirmish as string), seed });
  while (!state.result) {
    const team = activeUnit(state)?.team ?? 0;
    const bot = bots[team];
    if (!bot) throw new Error(`no bot for team ${team}`);
    const action = bot.chooseAction(state, team);
    expect(legalActions(state, team)).toContainEqual(action);
    state = apply(state, action).state;
  }
  return state;
}

describe("greedyBot", () => {
  it("takes a kill when it can", () => {
    const state = scenario(`
      map:
      1g 1g 1g 1g
      units:
      a  B  .  C
      stats:
      B  maxHp=20
    `);
    expect(greedyBot().chooseAction(state, 0)).toEqual({
      type: "attack",
      unit: "a",
      target: { x: 1, y: 0 },
    });
  });

  it("walks towards the enemy when nothing is in reach", () => {
    const state = scenario(`
      map:
      1g 1g 1g 1g 1g 1g 1g 1g 1g 1g
      units:
      a  .  .  .  .  .  .  .  .  B
    `);
    const action = greedyBot().chooseAction(state, 0) as Extract<Action, { type: "move" }>;
    expect(action.type).toBe("move");
    expect(distance(action.to, { x: 9, y: 0 })).toBe(5);
  });

  it("moves into range and then attacks in the same turn", () => {
    let state = scenario(`
      map:
      1g 1g 1g 1g
      units:
      a  .  .  B
    `);
    const bot = greedyBot();
    const first = bot.chooseAction(state, 0);
    expect(first).toEqual({ type: "move", unit: "a", to: { x: 2, y: 0 } });
    state = apply(state, first).state;
    expect(bot.chooseAction(state, 0)).toEqual({
      type: "attack",
      unit: "a",
      target: { x: 3, y: 0 },
    });
  });

  it("does not fireball its own team for a smaller gain", () => {
    let state = scenario(`
      map:
      1g 1g 1g 1g 1g
      units:
      a  .  b  C  .
      stats:
      a  abilities=fireball range=1 initiative=12
    `);
    // Play a's whole turn. A fireball on C would also hit b.
    const bot = greedyBot();
    while (activeUnit(state)?.id === "a") state = apply(state, bot.chooseAction(state, 0)).state;
    const hp = (id: string) => state.units.find((u) => u.id === id)?.hp;
    expect(hp("b")).toBe(100);
    expect(hp("C")).toBeLessThan(100);
  });

  it("is deterministic for a seed and a state", () => {
    const start = createMatch({ ...parseScenario(MAPS.skirmish as string), seed: 3 });
    expect(greedyBot(5).chooseAction(start, 0)).toEqual(greedyBot(5).chooseAction(start, 0));
  });

  it("beats the random bot", () => {
    let wins = 0;
    for (let seed = 0; seed < 6; seed++) {
      const greedyTeam = seed % 2;
      const bots =
        greedyTeam === 0 ? [greedyBot(seed), randomBot(seed)] : [randomBot(seed), greedyBot(seed)];
      if (playMatch(bots, seed).result?.winner === greedyTeam) wins++;
    }
    expect(wins).toBe(6);
  });
});
