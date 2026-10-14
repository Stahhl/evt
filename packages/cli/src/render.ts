import {
  ABILITIES,
  type GameEvent,
  type MatchState,
  type SurfaceKind,
  type Tile,
  tileAt,
  type Unit,
} from "@evt/engine";

const TERRAIN_SYMBOL: Record<Tile["terrain"], string> = { grass: ".", stone: "#", water: "~" };
const SURFACE_SYMBOL: Record<SurfaceKind, string> = {
  puddle: "=",
  steam: "^",
  ice: "*",
  electrified: "!",
  iceWall: "|",
};

export const LEGEND = [
  ". grass  # stone  ~ water  P pillar · digit = height · a-z team 0, A-Z team 1",
  "= puddle  ^ steam  * ice  ! electrified  | ice wall",
].join("\n");

/** The board with one 3-character cell per tile: symbol, height, space. */
export function renderBoard(state: MatchState): string {
  const { map } = state;
  const living = new Map<string, Unit>();
  for (const u of state.units) if (u.hp > 0) living.set(`${u.x},${u.y}`, u);

  const header = `    ${Array.from({ length: map.cols }, (_, x) => String(x).padEnd(3)).join("")}`;
  const rows = [header.trimEnd()];
  for (let y = 0; y < map.rows; y++) {
    let row = `${String(y).padStart(2)}  `;
    for (let x = 0; x < map.cols; x++) {
      const tile = tileAt(map, { x, y }) as Tile;
      const unit = living.get(`${x},${y}`);
      const ground = tile.surface
        ? SURFACE_SYMBOL[tile.surface.kind]
        : TERRAIN_SYMBOL[tile.terrain];
      const symbol = unit?.id ?? (tile.object === "pillar" ? "P" : ground);
      row += `${symbol}${tile.height} `;
    }
    rows.push(row.trimEnd());
  }
  return rows.join("\n");
}

export function renderUnits(state: MatchState): string {
  const active = state.result ? undefined : state.queue[0];
  return state.units
    .map((u) => {
      const marker = u.id === active ? ">" : " ";
      const where = u.hp > 0 ? `(${u.x},${u.y})` : "dead";
      const abilities = u.abilities
        .map((a) => (u.cooldowns[a] ? `${a}(${u.cooldowns[a]})` : a))
        .join(" ");
      const frozen = u.statuses.some((s) => s.kind === "frozen") ? " FROZEN" : "";
      return `${marker} ${u.id}  team ${u.team}  hp ${`${u.hp}/${u.maxHp}`.padEnd(7)}  ${where.padEnd(7)}  atk ${u.attack} rng ${u.range} mv ${u.move} jmp ${u.jump} ini ${u.initiative}  ${abilities}${frozen}`;
    })
    .join("\n");
}

export function renderStatus(state: MatchState): string {
  if (state.result) return `Round ${state.round}/${state.maxRounds} · ${describeResult(state)}`;
  const queue = state.queue.join(" ");
  return `Round ${state.round}/${state.maxRounds} · turn order: ${queue}`;
}

export function describeResult(state: MatchState): string {
  if (!state.result) return "in progress";
  const { winner } = state.result;
  return winner === null ? "draw" : `team ${winner} wins`;
}

export function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case "roundStarted":
      return `-- round ${e.round} --`;
    case "turnStarted":
      return `${e.unit}'s turn`;
    case "moved": {
      const to = e.path.at(-1);
      return `${e.unit} moves to (${to?.x},${to?.y})`;
    }
    case "attacked":
      return e.damage === 0
        ? `${e.unit} misses ${e.target}`
        : `${e.unit} hits ${e.target} for ${e.damage}`;
    case "dodge":
      return `${e.unit} is in steam: ${e.chance}% dodge, ${e.success ? "dodged" : "hit"}`;
    case "abilityUsed":
      return `${e.unit} casts ${ABILITIES[e.ability].name} at (${e.target.x},${e.target.y})`;
    case "damaged":
      return `${e.unit} takes ${e.amount} (${e.source})`;
    case "surfaceChanged":
      return `(${e.pos.x},${e.pos.y}) ${e.from ?? "bare"} → ${e.to ?? "bare"}`;
    case "frozen":
      return `${e.unit} is frozen`;
    case "turnSkipped":
      return `${e.unit} is frozen and skips the turn`;
    case "died":
      return `${e.unit} dies`;
    case "turnEnded":
      return `${e.unit} ends the turn`;
    case "matchEnded":
      return e.winner === null ? "match ends in a draw" : `match over: team ${e.winner} wins`;
  }
}
