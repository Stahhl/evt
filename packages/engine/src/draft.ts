/**
 * A mutable working copy used while one action is resolved. It copies what it
 * changes, so the state passed to apply is never modified, and collects the
 * events in the order things happen.
 */
import { EXPIRES_TO, SURFACE_ROUNDS } from "./abilities.ts";
import { indexPos, posIndex, samePos } from "./map.ts";
import { rollChance } from "./rng.ts";
import type {
  GameEvent,
  MatchState,
  Pos,
  Status,
  Surface,
  SurfaceKind,
  Tile,
  Unit,
} from "./types.ts";

/** Decides a roll with the given percent chance. Used by preview to explore every outcome. */
export type ForcedRoll = (percent: number) => boolean;

export class Draft {
  readonly base: MatchState;
  readonly events: GameEvent[] = [];
  units: Unit[];
  tiles: Tile[];
  queue: string[];
  round: number;
  turn: { moved: boolean; acted: boolean };
  rng: number;
  result: MatchState["result"];
  readonly #forced: ForcedRoll | undefined;

  constructor(state: MatchState, forced?: ForcedRoll) {
    this.base = state;
    this.units = [...state.units];
    this.tiles = [...state.map.tiles];
    this.queue = [...state.queue];
    this.round = state.round;
    this.turn = { ...state.turn };
    this.rng = state.rng;
    this.result = state.result;
    this.#forced = forced;
  }

  finish(): MatchState {
    const tilesChanged = this.tiles.some((t, i) => t !== this.base.map.tiles[i]);
    return {
      ...this.base,
      map: tilesChanged ? { ...this.base.map, tiles: this.tiles } : this.base.map,
      units: this.units,
      queue: this.queue,
      round: this.round,
      turn: this.turn,
      rng: this.rng,
      result: this.result,
    };
  }

  /** True with `percent`% probability, from the match rng unless outcomes are forced. */
  roll(percent: number): boolean {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    if (this.#forced) return this.#forced(percent);
    const [hit, next] = rollChance(this.rng, percent);
    this.rng = next;
    return hit;
  }

  unit(id: string): Unit {
    const u = this.units.find((v) => v.id === id);
    if (!u) throw new Error(`no unit ${id}`);
    return u;
  }

  /** The living unit on a tile, if any. */
  unitAt(pos: Pos): Unit | undefined {
    return this.units.find((u) => u.hp > 0 && samePos(u, pos));
  }

  updateUnit(id: string, patch: Partial<Unit>): void {
    this.units = this.units.map((u) => (u.id === id ? { ...u, ...patch } : u));
  }

  tile(pos: Pos): Tile {
    const t = this.tiles[posIndex(this.base.map, pos)];
    if (!t) throw new Error(`no tile at (${pos.x}, ${pos.y})`);
    return t;
  }

  /** Sets a surface with its full duration. Emits an event if the kind changes. */
  setSurface(pos: Pos, kind: SurfaceKind | null): void {
    const index = posIndex(this.base.map, pos);
    const tile = this.tiles[index] as Tile;
    const surface: Surface | null = kind ? { kind, rounds: SURFACE_ROUNDS[kind] } : null;
    this.tiles[index] = { ...tile, surface };
    const from = tile.surface?.kind ?? null;
    if (from !== kind) this.events.push({ type: "surfaceChanged", pos, from, to: kind });
  }

  /** Lowers hp, never below 0, and handles death. Returns the damage dealt. */
  damage(id: string, amount: number, event: (dealt: number) => GameEvent): number {
    const u = this.unit(id);
    if (u.hp === 0) return 0;
    const dealt = Math.min(u.hp, amount);
    this.updateUnit(id, { hp: u.hp - dealt });
    this.events.push(event(dealt));
    if (u.hp - dealt === 0) {
      this.events.push({ type: "died", unit: id });
      // Remove from the round, except as the active unit whose turn is in progress.
      this.queue = this.queue.filter((q, i) => q !== id || i === 0);
    }
    return dealt;
  }

  addStatus(id: string, status: Status): void {
    const u = this.unit(id);
    const others = u.statuses.filter((s) => s.kind !== status.kind);
    const old = u.statuses.find((s) => s.kind === status.kind);
    const turns = Math.max(old?.turns ?? 0, status.turns);
    this.updateUnit(id, { statuses: [...others, { ...status, turns }] });
  }

  /** Counts down every timed surface; expired ones turn into their EXPIRES_TO. */
  tickSurfaces(): void {
    for (const [index, tile] of this.tiles.entries()) {
      const s = tile.surface;
      if (!s || s.rounds === null) continue;
      if (s.rounds > 1) {
        this.tiles[index] = { ...tile, surface: { ...s, rounds: s.rounds - 1 } };
      } else {
        this.setSurface(indexPos(this.base.map, index), EXPIRES_TO[s.kind]);
      }
    }
  }
}
