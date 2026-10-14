/**
 * Seeded PRNG (mulberry32). Pure and functional: every call returns the value
 * together with the next state, so the state can live inside the game state
 * and be serialized with it.
 *
 * The rules are deterministic by default. Randomness only enters through
 * buffs/debuffs that explicitly carry a chance, e.g. dodge in steam.
 */

/** Unsigned 32-bit integer. */
export type RngState = number;

export function seedRng(seed: number): RngState {
  if (!Number.isInteger(seed)) throw new RangeError(`seed must be an integer, got ${seed}`);
  return seed >>> 0;
}

export function nextUint32(state: RngState): [value: number, next: RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, next];
}

/** Uniform integer in [0, n). Rejection sampling, so there is no modulo bias. */
export function rollBelow(state: RngState, n: number): [value: number, next: RngState] {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) {
    throw new RangeError(`n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = 2 ** 32 - (2 ** 32 % n);
  let s = state;
  for (;;) {
    const [v, next] = nextUint32(s);
    s = next;
    if (v < limit) return [v % n, s];
  }
}

/** True with `percent`% probability. 0 never rolls and never advances the state. */
export function rollChance(state: RngState, percent: number): [hit: boolean, next: RngState] {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`percent must be an integer in [0, 100], got ${percent}`);
  }
  if (percent === 0) return [false, state];
  if (percent === 100) return [true, state];
  const [roll, next] = rollBelow(state, 100);
  return [roll < percent, next];
}
