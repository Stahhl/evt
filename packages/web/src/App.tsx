import { MAPS } from "@evt/engine";
import { useState } from "react";
import { Game } from "./Game.tsx";

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
export const DEFAULT_MAP = "highlands";

export function App() {
  const [match, setMatch] = useState(() => ({ seed: newSeed(), map: DEFAULT_MAP }));
  return (
    <Game
      key={`${match.map}-${match.seed}`}
      seed={match.seed}
      map={match.map in MAPS ? match.map : DEFAULT_MAP}
      onNewGame={(map) => setMatch({ seed: newSeed(), map })}
    />
  );
}
