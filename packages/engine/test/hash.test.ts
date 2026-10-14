import { describe, expect, it } from "vitest";
import { canonicalize, hashState } from "../src/index.ts";

describe("canonicalize", () => {
  it("ignores key order", () => {
    expect(canonicalize({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalize({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  it("rejects non-deterministic values", () => {
    expect(() => canonicalize({ hp: 1.5 })).toThrow();
    expect(() => canonicalize({ hp: undefined })).toThrow();
    expect(() => canonicalize(new Map())).toThrow();
  });
});

describe("hashState", () => {
  it("is stable", () => {
    expect(hashState({ round: 4, units: ["sk", "tc"] })).toBe(
      hashState({ units: ["sk", "tc"], round: 4 }),
    );
    expect(hashState({ round: 4 })).not.toBe(hashState({ round: 5 }));
    expect(hashState({})).toMatch(/^[0-9a-f]{16}$/);
  });
});
