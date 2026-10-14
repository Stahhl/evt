/**
 * AI opponents. Planned: random, greedy (1-ply via engine.preview) and MCTS.
 * Bots are pure like the engine and get their randomness from a seed.
 */
export interface Bot<State, Action> {
  readonly name: string;
  chooseAction(state: State, legal: readonly Action[]): Action;
}
