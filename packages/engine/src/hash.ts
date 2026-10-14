/**
 * Canonical serialization and hashing of game state, used to detect desyncs
 * between server, client and replays.
 */

/**
 * JSON with sorted object keys. Throws on values that are not deterministic
 * across platforms: non-integer numbers, undefined, functions, etc.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`state must only contain safe integers, got ${value}`);
      }
      return Object.is(value, -0) ? "0" : String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError("state must only contain plain objects and arrays");
      }
      const entries = Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`state cannot contain values of type ${typeof value}`);
  }
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-16 code units of the canonical form, as 16 hex chars. */
export function hashState(value: unknown): string {
  const text = canonicalize(value);
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = ((h ^ BigInt(c & 0xff)) * FNV_PRIME) & MASK_64;
    h = ((h ^ BigInt(c >>> 8)) * FNV_PRIME) & MASK_64;
  }
  return h.toString(16).padStart(16, "0");
}
