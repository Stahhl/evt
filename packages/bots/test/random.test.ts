import {
  activeUnit,
  apply,
  createMatch,
  legalActions,
  MAPS,
  type MatchState,
  parseScenario,
} from "@evt/engine";
import { describe, expect, it } from "vitest";
import { randomBot } from "../src/index.ts";

const start = createMatch({ ...parseScenario(MAPS.skirmish as string), seed: 1 });

function playBots(seed0: number, seed1: number): MatchState {
  const bots = [randomBot(seed0), randomBot(seed1)];
  let state = start;
  while (!state.result) {
    const team = activeUnit(state)?.team ?? 0;
    const bot = bots[team];
    if (!bot) throw new Error(`no bot for team ${team}`);
    state = apply(state, bot.chooseAction(state, team)).state;
  }
  return state;
}

describe("randomBot", () => {
  it("only picks legal actions", () => {
    const bot = randomBot(3);
    let state = start;
    for (let i = 0; i < 50 && !state.result; i++) {
      const team = activeUnit(state)?.team ?? 0;
      const action = bot.chooseAction(state, team);
      expect(legalActions(state, team)).toContainEqual(action);
      state = apply(state, action).state;
    }
  });

  it("is deterministic for a seed and a state", () => {
    expect(randomBot(5).chooseAction(start, 0)).toEqual(randomBot(5).chooseAction(start, 0));
    expect(playBots(1, 2)).toEqual(playBots(1, 2));
  });

  it("plays differently with different seeds", () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        JSON.stringify(randomBot(seed).chooseAction(start, 0)),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("refuses to move when it is not its team's turn", () => {
    expect(() => randomBot(1).chooseAction(start, 1)).toThrow();
  });
});
