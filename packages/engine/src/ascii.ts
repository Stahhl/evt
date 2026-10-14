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
 * s (stone), g (grass) or w (water). In the units grid, `.` is an empty tile and
 * a letter is a unit with that letter as id: lowercase is team 0, uppercase team 1.
 */
import type { UnitSetup } from "./match.ts";
import type { GameMap, Terrain, Tile } from "./types.ts";

const TERRAIN: Record<string, Terrain> = { s: "stone", g: "grass", w: "water" };
const TILE = /^(\d)([sgw])(P?)$/;
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
      tiles.push({
        height: Number(m[1]),
        terrain: TERRAIN[m[2] as string] as Terrain,
        object: m[3] ? "pillar" : null,
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
  return { map, units };
}
