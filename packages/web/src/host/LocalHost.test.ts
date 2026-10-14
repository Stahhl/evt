import { randomBot } from "@evt/bots";
import { activeUnit, type MatchSetup, parseScenario, verifyReplay } from "@evt/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostUpdate } from "./GameHost.ts";
import { LocalHost } from "./LocalHost.ts";

const setup: MatchSetup = {
  ...parseScenario(`
    map:
    1g 1g 1g 1g
    units:
    a  .  .  B
    stats:
    a  initiative=12
  `),
  seed: 1,
  maxRounds: 3,
};

describe("LocalHost", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the person the teams without bots and plays the bots itself", () => {
    const host = new LocalHost({ setup, bots: { 1: randomBot(1) }, botDelayMs: 100 });
    const updates: HostUpdate[] = [];
    host.subscribe((u) => updates.push(u));
    expect(host.localTeams).toEqual([0]);

    host.submit({ type: "endTurn", unit: "a" });
    expect(updates).toHaveLength(1);
    expect(activeUnit(host.state)?.id).toBe("B");

    // The bot waits its delay, then acts until it is the person's turn again.
    vi.advanceTimersByTime(100 * 10);
    expect(updates.length).toBeGreaterThan(1);
    expect(activeUnit(host.state)?.team).toBe(0);
    expect(updates.at(-1)?.state).toBe(host.state);
    host.dispose();
  });

  it("refuses actions when it is not the person's turn", () => {
    const host = new LocalHost({ setup, bots: { 1: randomBot(1) } });
    host.submit({ type: "endTurn", unit: "a" });
    expect(() => host.submit({ type: "endTurn", unit: "B" })).toThrow(/not your turn/);
    host.dispose();
  });

  it("records a replay that verifies", () => {
    const host = new LocalHost({
      setup,
      bots: { 0: randomBot(1), 1: randomBot(2) },
      botDelayMs: 1,
    });
    vi.runAllTimers();
    expect(host.state.result).not.toBeNull();
    expect(verifyReplay(host.replay).ok).toBe(true);
    host.dispose();
  });

  it("stops the bots when disposed", () => {
    const host = new LocalHost({
      setup,
      bots: { 0: randomBot(1), 1: randomBot(2) },
      botDelayMs: 1,
    });
    const listener = vi.fn();
    host.subscribe(listener);
    host.dispose();
    vi.runAllTimers();
    expect(listener).not.toHaveBeenCalled();
  });
});
