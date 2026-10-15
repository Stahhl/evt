/**
 * Aiming on touch screens: the player picks what to do (move, attack or an
 * ability) and then a tile. These helpers turn that choice into actions.
 */
import { type AbilityId, type Action, distance, type Pos } from "@evt/engine";
import { posKey, type TurnOptions } from "./options.ts";

export type Aim = "move" | "attack" | AbilityId;

/** Whether the active unit can still do this. */
export function canAim(options: TurnOptions, aim: Aim): boolean {
  if (aim === "move") return options.moves.size > 0;
  if (aim === "attack") return options.attacks.size > 0;
  return (options.abilities.get(aim)?.size ?? 0) > 0;
}

/** What to aim at the start of a turn and after each action: move first, then attack. */
export function defaultAim(options: TurnOptions): Aim | null {
  if (options.moves.size > 0) return "move";
  if (options.attacks.size > 0) return "attack";
  return [...options.abilities.keys()][0] ?? null;
}

/** The action aiming at `pos` would submit, or null if `pos` is not a target. */
export function aimAction(options: TurnOptions, aim: Aim, unit: string, pos: Pos): Action | null {
  const k = posKey(pos);
  if (aim === "move") return options.moves.has(k) ? { type: "move", unit, to: pos } : null;
  if (aim === "attack") return options.attacks.get(k) ?? null;
  return options.abilities.get(aim)?.get(k) ?? null;
}

/** Every tile that is a target for this aim. */
export function aimTiles(options: TurnOptions, aim: Aim): Pos[] {
  if (aim === "move") {
    return [...options.moves.values()].flatMap((path) => path.slice(-1));
  }
  const actions = aim === "attack" ? options.attacks : options.abilities.get(aim);
  return [...(actions?.values() ?? [])].flatMap((a) =>
    a.type === "attack" || a.type === "ability" ? [a.target] : [],
  );
}

/**
 * Where to put the crosshair when aiming starts: on the unit itself for a
 * move, else on the nearest target.
 */
export function firstTarget(options: TurnOptions, aim: Aim, from: Pos): Pos {
  if (aim === "move") return { x: from.x, y: from.y };
  let best: Pos = { x: from.x, y: from.y };
  let bestDistance = Infinity;
  for (const p of aimTiles(options, aim)) {
    const d = distance(from, p);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}
