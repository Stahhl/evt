/**
 * Which kind of character a unit is. The engine only knows stats and
 * abilities, so the board and the HUD read the kind from the element of the
 * unit's first ability.
 */
import { ABILITIES, type Unit } from "@evt/engine";

export type Archetype = "knight" | "archer" | "scout" | "warden";

export const ARCHETYPE_NAME: Record<Archetype, string> = {
  knight: "Fire knight",
  archer: "Ice archer",
  scout: "Lightning scout",
  warden: "Warden",
};

export function archetypeOf(unit: Pick<Unit, "abilities">): Archetype {
  const first = unit.abilities[0];
  if (!first) return "warden";
  switch (ABILITIES[first].element) {
    case "fire":
      return "knight";
    case "ice":
      return "archer";
    case "lightning":
      return "scout";
  }
}
