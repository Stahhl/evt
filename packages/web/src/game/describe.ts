import { ABILITIES, type GameEvent, type MatchState } from "@evt/engine";

const SOURCE: Record<string, string> = {
  conduction: "conducted lightning",
  electrified: "the electrified ground",
};

export function describeEvent(e: GameEvent): string | null {
  switch (e.type) {
    case "roundStarted":
      return `Round ${e.round}`;
    case "turnStarted":
      return null;
    case "moved": {
      const to = e.path.at(-1);
      return `${e.unit} moves to (${to?.x}, ${to?.y})`;
    }
    case "attacked":
      return e.damage === 0
        ? `${e.unit} misses ${e.target}`
        : `${e.unit} hits ${e.target} for ${e.damage}`;
    case "dodge":
      return e.success ? `${e.unit} dodges in the steam` : null;
    case "abilityUsed":
      return `${e.unit} casts ${ABILITIES[e.ability].name}`;
    case "damaged": {
      const source =
        e.source in ABILITIES
          ? ABILITIES[e.source as keyof typeof ABILITIES].name
          : SOURCE[e.source];
      return `${e.unit} takes ${e.amount} from ${source}`;
    }
    case "surfaceChanged":
      return null;
    case "frozen":
      return `${e.unit} is frozen`;
    case "turnSkipped":
      return `${e.unit} is frozen and skips the turn`;
    case "died":
      return `${e.unit} is defeated`;
    case "turnEnded":
      return null;
    case "matchEnded":
      return e.winner === null ? "The match is a draw" : `Team ${e.winner} wins`;
  }
}

export function resultText(state: MatchState, localTeams: readonly number[]): string {
  const winner = state.result?.winner;
  if (winner === null || winner === undefined) return "Draw";
  return localTeams.includes(winner) ? "Victory" : "Defeat";
}
