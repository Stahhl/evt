import { useState } from "react";
import { Game } from "./Game.tsx";

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function App() {
  const [seed, setSeed] = useState(newSeed);
  return <Game key={seed} seed={seed} onRestart={() => setSeed(newSeed())} />;
}
