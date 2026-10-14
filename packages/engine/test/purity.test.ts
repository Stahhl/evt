import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The engine must be deterministic: same input, same output, on every platform.
// The tsconfig already keeps out DOM and Node APIs; this catches what ES itself offers.
const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, "use the seeded rng in rng.ts"],
  [/\bDate\b/, "the engine has no clock; count rounds instead"],
  [/\bperformance\b/, "the engine has no clock"],
  [/\bcrypto\b/, "use the seeded rng in rng.ts"],
  [/\bfrom\s+["']node:/, "the engine must not do I/O"],
];

const srcDir = join(import.meta.dirname, "../src");
const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) =>
  f.endsWith(".ts"),
);

describe("engine purity", () => {
  it.each(files)("%s uses no banned APIs", (file) => {
    const source = readFileSync(join(srcDir, file), "utf8");
    for (const [pattern, why] of BANNED) {
      expect(pattern.test(source), `${file} matches ${pattern}: ${why}`).toBe(false);
    }
  });
});
