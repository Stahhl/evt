/**
 * Text format for maps and unit placement, so scenario tests can be written as
 * pictures of the board:
 *
 *   map:
 *   1g 1g 2s 2sP
 *   1g 0w 2s 2s
 *   units:
 *   a  .  .  B
 *   .  .  b  .
 *
 * A tile is <height digit><terrain> with an optional P for a pillar. Terrain is
 * s (stone), g (grass) or w (water). A surface can follow after a +: p
 * (puddle), s (steam), i (ice), e (electrified) or W (ice wall), e.g. 1g+p. In the units grid, `.` is an empty tile and
 * a letter is a unit with that letter as id: lowercase is team 0, uppercase team 1.
 *
 * An optional stats section overrides DEFAULT_STATS per unit:
 *
 *   stats:
 *   a  range=4 attack=20 abilities=fireball,iceWall
 *   B  maxHp=120
 */
import { isAbilityId, SURFACE_ROUNDS } from "./abilities.ts";
import { DEFAULT_STATS, type UnitSetup } from "./match.ts";
import type { AbilityId, GameMap, SurfaceKind, Terrain, Tile, UnitStats } from "./types.ts";

const TERRAIN: Record<string, Terrain> = { s: "stone", g: "grass", w: "water" };
const SURFACE: Record<string, SurfaceKind> = {
  p: "puddle",
  s: "steam",
  i: "ice",
  e: "electrified",
  W: "iceWall",
};
const TILE = /^(\d)([sgw])(P?)(?:\+([psieW]))?$/;
const UNIT = /^[a-zA-Z]$/;

export function parseScenario(text: string): { map: GameMap; units: UnitSetup[] } {
  const sections: Record<string, string[][]> = {};
  let current: string[][] | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const header = line.match(/^(\w+):$/);
    if (header?.[1]) {
      current = sections[header[1]] = [];
    } else if (current) {
      current.push(line.split(/\s+/));
    } else {
      throw new SyntaxError(`expected a section header such as "map:", got "${line}"`);
    }
  }

  const mapRows = sections.map;
  if (!mapRows?.length) throw new SyntaxError('scenario has no "map:" section');
  const cols = (mapRows[0] as string[]).length;
  const tiles: Tile[] = [];
  for (const [y, row] of mapRows.entries()) {
    if (row.length !== cols)
      throw new SyntaxError(`map row ${y} has ${row.length} tiles, expected ${cols}`);
    for (const token of row) {
      const m = token.match(TILE);
      if (!m) throw new SyntaxError(`bad tile "${token}" in map row ${y}`);
      const surface = m[4] ? (SURFACE[m[4]] as SurfaceKind) : null;
      tiles.push({
        height: Number(m[1]),
        terrain: TERRAIN[m[2] as string] as Terrain,
        object: m[3] ? "pillar" : null,
        surface: surface ? { kind: surface, rounds: SURFACE_ROUNDS[surface] } : null,
      });
    }
  }
  const map: GameMap = { cols, rows: mapRows.length, tiles };

  const units: UnitSetup[] = [];
  const unitRows = sections.units ?? [];
  if (unitRows.length > 0 && unitRows.length !== map.rows) {
    throw new SyntaxError(`units grid has ${unitRows.length} rows, expected ${map.rows}`);
  }
  for (const [y, row] of unitRows.entries()) {
    if (row.length !== cols)
      throw new SyntaxError(`units row ${y} has ${row.length} cells, expected ${cols}`);
    for (const [x, token] of row.entries()) {
      if (token === ".") continue;
      if (!UNIT.test(token)) throw new SyntaxError(`bad unit "${token}" at (${x}, ${y})`);
      if (units.some((u) => u.id === token)) throw new SyntaxError(`unit "${token}" appears twice`);
      units.push({ id: token, team: token === token.toLowerCase() ? 0 : 1, x, y });
    }
  }
  for (const [line, [id, ...pairs]] of (sections.stats ?? []).entries()) {
    const index = units.findIndex((u) => u.id === id);
    if (index < 0) throw new SyntaxError(`stats line ${line} names unknown unit "${id}"`);
    const stats: Record<string, number> = {};
    let abilities: AbilityId[] | undefined;
    for (const pair of pairs) {
      const list = pair.match(/^abilities=([\w,]+)$/);
      if (list?.[1]) {
        abilities = list[1].split(",").map((a) => {
          if (!isAbilityId(a)) throw new SyntaxError(`unknown ability "${a}" for unit "${id}"`);
          return a;
        });
        continue;
      }
      const m = pair.match(/^(\w+)=(-?\d+)$/);
      if (!m?.[1] || !(m[1] in DEFAULT_STATS)) {
        throw new SyntaxError(`bad stat "${pair}" for unit "${id}"`);
      }
      stats[m[1]] = Number(m[2]);
    }
    units[index] = {
      ...units[index],
      ...(stats as Partial<UnitStats>),
      ...(abilities ? { abilities } : {}),
    } as UnitSetup;
  }
  return { map, units };
}
