import type { GameEvent, MatchState } from "@evt/engine";

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
      return `${e.unit} hits ${e.target} for ${e.damage}`;
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
