import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Action,
  apply,
  createMatch,
  legalActions,
  type MatchSetup,
  parseScenario,
  type Replay,
  ReplayRecorder,
  RULES_VERSION,
  verifyReplay,
} from "../src/index.ts";

const SETUP: MatchSetup = {
  ...parseScenario(`
    map:
    1g 1g 1g
    1g 1g 1g
    units:
    a  .  .
    .  .  B
  `),
  seed: 7,
};

/** Plays the first legal action every time, which walks units into each other. */
function record(setup: MatchSetup, steps: number): Replay {
  let state = createMatch(setup);
  const recorder = new ReplayRecorder(setup, state);
  for (let i = 0; i < steps && !state.result; i++) {
    const team = state.units.find((u) => u.id === state.queue[0])?.team ?? 0;
    const action = legalActions(state, team)[0] as Action;
    state = apply(state, action).state;
    recorder.record(action, state);
  }
  return recorder.toJSON();
}

describe("replays", () => {
  it("verify when nothing has changed, also after a JSON round trip", () => {
    const replay = JSON.parse(JSON.stringify(record(SETUP, 12))) as Replay;
    expect(replay.actions).toHaveLength(12);
    expect(replay.hashes).toHaveLength(13);
    const check = verifyReplay(replay);
    expect(check.ok).toBe(true);
  });

  it("report the first step whose hash differs", () => {
    const replay = record(SETUP, 12);
    const hashes = [...replay.hashes];
    hashes[5] = "0000000000000000";
    expect(verifyReplay({ ...replay, hashes })).toMatchObject({ ok: false, step: 5 });
  });

  it("report an action the engine no longer accepts", () => {
    const replay = record(SETUP, 4);
    const actions = [...replay.actions];
    actions[2] = { type: "endTurn", unit: "nobody" };
    expect(verifyReplay({ ...replay, actions })).toMatchObject({ ok: false, step: 3 });
  });

  it("refuse another rules version", () => {
    const replay = { ...record(SETUP, 2), rulesVersion: "v-old" };
    expect(verifyReplay(replay)).toMatchObject({ ok: false, step: 0 });
  });
});

/**
 * Golden replays are recorded matches checked into the repo. If one fails, a
 * change altered the outcome of a match: either fix the regression, or bump
 * RULES_VERSION and record the golden replays again (see README).
 */
describe("golden replays", () => {
  const dir = join(import.meta.dirname, "golden");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s still plays out identically", (file) => {
    const replay = JSON.parse(readFileSync(join(dir, file), "utf8")) as Replay;
    expect(replay.rulesVersion, "re-record golden replays after bumping RULES_VERSION").toBe(
      RULES_VERSION,
    );
    const check = verifyReplay(replay);
    expect(check.ok ? "ok" : `step ${check.step}: ${check.reason}`).toBe("ok");
    if (check.ok) expect(check.state.result).not.toBeNull();
  });
});
