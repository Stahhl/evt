import { describe, expect, it } from "vitest";
import { createMatch, MAPS, parseScenario, tileAt } from "../src/index.ts";

describe.each(Object.keys(MAPS))("map %s", (name) => {
  const scenario = parseScenario(MAPS[name] as string);

  it("starts a valid match", () => {
    expect(() => createMatch({ ...scenario, seed: 1 })).not.toThrow();
  });

  it("is point-symmetric, so neither team has better ground", () => {
    const { map, units } = scenario;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const mirror = { x: map.cols - 1 - x, y: map.rows - 1 - y };
        expect(tileAt(map, { x, y }), `(${x},${y})`).toEqual(tileAt(map, mirror));
      }
    }
    for (const u of units) {
      const twin = units.find((v) => v.x === map.cols - 1 - u.x && v.y === map.rows - 1 - u.y);
      expect(twin, `no twin for ${u.id}`).toBeDefined();
      expect(twin?.team).not.toBe(u.team);
      const { id: _a, team: _b, x: _c, y: _d, ...stats } = u;
      const { id: _e, team: _f, x: _g, y: _h, ...twinStats } = twin ?? u;
      expect(twinStats).toEqual(stats);
    }
  });
});
