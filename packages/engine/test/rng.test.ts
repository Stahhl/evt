import { describe, expect, it } from "vitest";
import { nextUint32, rollBelow, rollChance, seedRng } from "../src/index.ts";

function sequence(seed: number, length: number): number[] {
  let s = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const [v, next] = nextUint32(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    expect(sequence(42, 5)).toEqual(sequence(42, 5));
    expect(sequence(42, 5)).not.toEqual(sequence(43, 5));
  });

  it("produces a stable sequence across versions", () => {
    // Reference mulberry32 output for seed 1. If this changes, every recorded
    // replay with randomness breaks.
    expect(sequence(1, 3)).toEqual([2693262067, 11749833, 2265367787]);
  });

  it("rollBelow stays in range", () => {
    let s = seedRng(7);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = rollBelow(s, 6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      s = next;
    }
  });

  it("rollChance at 0 and 100 is certain and consumes no randomness", () => {
    const s = seedRng(9);
    expect(rollChance(s, 0)).toEqual([false, s]);
    expect(rollChance(s, 100)).toEqual([true, s]);
  });

  it("rollChance at 50 hits roughly half the time", () => {
    let s = seedRng(123);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      const [hit, next] = rollChance(s, 50);
      if (hit) hits++;
      s = next;
    }
    expect(hits).toBeGreaterThan(4800);
    expect(hits).toBeLessThan(5200);
  });
});
