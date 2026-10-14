import { createInterface } from "node:readline/promises";
import { randomBot } from "@evt/bots";
import {
  ABILITIES,
  type Action,
  legalActions,
  type MatchState,
  preview,
  type Team,
} from "@evt/engine";
import { LEGEND, renderBoard, renderStatus, renderUnits } from "./render.ts";

export interface Player {
  readonly name: string;
  readonly human: boolean;
  chooseAction(state: MatchState, team: Team): Promise<Action>;
  close?(): void;
}

/** "human" or "bot:<name>". Bots get their own seed derived from the match seed. */
export function createPlayer(spec: string, seed: number): Player {
  if (spec === "human") return humanPlayer();
  if (spec === "bot:random") {
    const bot = randomBot(seed);
    return {
      name: "bot:random",
      human: false,
      chooseAction: async (s, t) => bot.chooseAction(s, t),
    };
  }
  throw new Error(`unknown player "${spec}"; use human or bot:random`);
}

function describeAction(state: MatchState, action: Action): string {
  switch (action.type) {
    case "move":
      return `move to (${action.to.x},${action.to.y})`;
    case "attack":
      return `attack (${action.target.x},${action.target.y}): ${describeOutcome(state, action)}`;
    case "ability":
      return `${ABILITIES[action.ability].name} (${action.target.x},${action.target.y}): ${describeOutcome(state, action)}`;
    case "endTurn":
      return "end turn";
  }
}

/** e.g. "B -30, kills B" or "50%: nothing | 50%: B -30" when there are rolls. */
function describeOutcome(state: MatchState, action: Action): string {
  const { branches } = preview(state, action);
  const one = branches.map((b) => {
    const hits = b.hpChanges.map((c) => `${c.unit} ${c.delta}`).join(", ") || "no damage";
    const deaths = b.deaths.length ? `, kills ${b.deaths.join(", ")}` : "";
    return `${hits}${deaths}`;
  });
  if (branches.length === 1) return one[0] ?? "";
  return branches.map((b, i) => `${Math.round(b.chance * 100)}%: ${one[i]}`).join(" | ");
}

function humanPlayer(): Player {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    name: "human",
    human: true,
    async chooseAction(state, team) {
      const actions = legalActions(state, team);
      console.log(
        `\n${renderStatus(state)}\n${renderBoard(state)}\n${LEGEND}\n\n${renderUnits(state)}\n`,
      );
      actions.forEach((a, i) => {
        console.log(`${String(i + 1).padStart(3)}) ${describeAction(state, a)}`);
      });
      for (;;) {
        const answer = (await rl.question(`${state.queue[0]}> `)).trim();
        if (answer === "q") throw new Quit();
        const choice = actions[Number(answer) - 1];
        if (choice) return choice;
        console.log(`pick a number from 1 to ${actions.length}, or q to quit`);
      }
    },
    close: () => rl.close(),
  };
}

export class Quit extends Error {}
