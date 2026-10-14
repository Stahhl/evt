import type { Bot } from "@evt/bots";
import {
  type Action,
  activeUnit,
  apply,
  createMatch,
  type MatchSetup,
  type MatchState,
  type Replay,
  ReplayRecorder,
  type Team,
} from "@evt/engine";
import type { GameHost, HostUpdate } from "./GameHost.ts";

export interface LocalHostOptions {
  readonly setup: MatchSetup;
  /** Teams without a bot are played by the local person. */
  readonly bots: Readonly<Record<Team, Bot>>;
  /** Pause before each bot action, so the person can follow along. */
  readonly botDelayMs?: number;
}

/** Runs the whole match in the browser: no server, works offline. */
export class LocalHost implements GameHost {
  #state: MatchState;
  readonly #bots: Readonly<Record<Team, Bot>>;
  readonly #botDelayMs: number;
  readonly #listeners = new Set<(update: HostUpdate) => void>();
  readonly #recorder: ReplayRecorder;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  readonly localTeams: readonly Team[];

  constructor(options: LocalHostOptions) {
    this.#state = createMatch(options.setup);
    this.#bots = options.bots;
    this.#botDelayMs = options.botDelayMs ?? 400;
    this.#recorder = new ReplayRecorder(options.setup, this.#state);
    const teams = [...new Set(this.#state.units.map((u) => u.team))].sort((a, b) => a - b);
    this.localTeams = teams.filter((t) => !(t in this.#bots));
    this.#scheduleBot();
  }

  get state(): MatchState {
    return this.#state;
  }

  get replay(): Replay {
    return this.#recorder.toJSON();
  }

  submit(action: Action): void {
    const team = activeUnit(this.#state)?.team;
    if (team === undefined || !this.localTeams.includes(team)) {
      throw new Error("it is not your turn");
    }
    this.#apply(action);
  }

  subscribe(listener: (update: HostUpdate) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#listeners.clear();
  }

  #apply(action: Action): void {
    const { state, events } = apply(this.#state, action);
    this.#state = state;
    this.#recorder.record(action, state);
    for (const listener of this.#listeners) listener({ action, events, state });
    this.#scheduleBot();
  }

  #scheduleBot(): void {
    const team = activeUnit(this.#state)?.team;
    const bot = team === undefined ? undefined : this.#bots[team];
    if (!bot || team === undefined || this.#disposed) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.#disposed) this.#apply(bot.chooseAction(this.#state, team));
    }, this.#botDelayMs);
  }
}
