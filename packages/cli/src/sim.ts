import { BOTS } from "@evt/bots";
import { activeUnit, apply, createMatch, type MatchSetup } from "@evt/engine";

export interface SimOptions {
  readonly setup: Omit<MatchSetup, "seed">;
  readonly p1: string;
  readonly p2: string;
  readonly games: number;
  readonly seed: number;
}

export interface SimResult {
  readonly games: number;
  /** Wins per player spec, counted for whichever side it played. */
  readonly wins: Readonly<Record<"p1" | "p2", number>>;
  readonly draws: number;
  /** Games won by team 0, which acts first when initiative ties. */
  readonly team0Wins: number;
  readonly rounds: { readonly mean: number; readonly min: number; readonly max: number };
  readonly actions: number;
  readonly ms: number;
}

function bot(spec: string, seed: number) {
  const make = spec.startsWith("bot:") ? BOTS[spec.slice(4)] : undefined;
  if (!make)
    throw new Error(
      `sim needs bots, got "${spec}"; use ${Object.keys(BOTS)
        .map((b) => `bot:${b}`)
        .join(", ")}`,
    );
  return make(seed);
}

/**
 * Plays bot against bot. Sides swap every game, since team 0 wins initiative
 * ties, so p1 plays team 0 in even games and team 1 in odd ones.
 */
export function simulate(options: SimOptions, onGame?: (done: number) => void): SimResult {
  const wins = { p1: 0, p2: 0 };
  let draws = 0;
  let team0Wins = 0;
  let actions = 0;
  const rounds: number[] = [];
  const start = performance.now();
  for (let game = 0; game < options.games; game++) {
    const seed = options.seed + game;
    const swapped = game % 2 === 1;
    const sides = swapped ? (["p2", "p1"] as const) : (["p1", "p2"] as const);
    const bots = sides.map((side, team) => bot(options[side], seed * 2 + team));
    let state = createMatch({ ...options.setup, seed });
    while (!state.result) {
      const team = activeUnit(state)?.team ?? 0;
      state = apply(state, (bots[team] as ReturnType<typeof bot>).chooseAction(state, team)).state;
      actions++;
    }
    const winner = state.result.winner;
    if (winner === null) draws++;
    else wins[sides[winner] as "p1" | "p2"]++;
    if (winner === 0) team0Wins++;
    rounds.push(state.round);
    onGame?.(game + 1);
  }
  return {
    games: options.games,
    wins,
    draws,
    team0Wins,
    rounds: {
      mean: rounds.reduce((a, b) => a + b, 0) / Math.max(1, rounds.length),
      min: Math.min(...rounds),
      max: Math.max(...rounds),
    },
    actions,
    ms: performance.now() - start,
  };
}

export function formatSim(options: SimOptions, r: SimResult): string {
  const pct = (n: number) => `${((100 * n) / r.games).toFixed(1)}%`;
  return [
    `${r.games} games · sides swap every game · seeds ${options.seed}–${options.seed + r.games - 1}`,
    `p1 ${options.p1.padEnd(12)} wins ${String(r.wins.p1).padStart(4)}  ${pct(r.wins.p1)}`,
    `p2 ${options.p2.padEnd(12)} wins ${String(r.wins.p2).padStart(4)}  ${pct(r.wins.p2)}`,
    `draws${"".padEnd(13)} ${String(r.draws).padStart(4)}  ${pct(r.draws)}`,
    `team 0 (first on initiative ties) wins ${pct(r.team0Wins)}`,
    `rounds: mean ${r.rounds.mean.toFixed(1)}, min ${r.rounds.min}, max ${r.rounds.max}`,
    `${r.actions} actions in ${(r.ms / 1000).toFixed(1)} s`,
  ].join("\n");
}
