#!/usr/bin/env node
// Headless entry point. Runs directly on Node's built-in TypeScript support.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  activeUnit,
  apply,
  createMatch,
  MAPS,
  type MatchSetup,
  parseScenario,
  type Replay,
  ReplayRecorder,
  RULES_VERSION,
  verifyReplay,
} from "@evt/engine";
import { createPlayer, PLAYER_NAMES, Quit } from "./players.ts";
import {
  describeEvent,
  describeResult,
  LEGEND,
  renderBoard,
  renderStatus,
  renderUnits,
} from "./render.ts";
import { formatSim, simulate } from "./sim.ts";

const USAGE = `Usage: evt <command> [options]

Commands:
  version                 Print the rules version
  maps                    List the built-in maps
  play [options]          Play a match in the terminal
      --map <name|file>   Built-in map or scenario file (default: skirmish)
      --p1 <player>       human, bot:random or bot:greedy (default: human)
      --p2 <player>       human, bot:random or bot:greedy (default: bot:greedy)
      --seed <n>          Match seed (default: random)
      --max-rounds <n>    Draw after this round
      --out <file>        Save the replay as JSON
      --watch             Print the board every turn, also for bot vs bot
  replay <file>           Verify a replay against this engine
      --watch             Print every event and the final board
  sim [options]           Play bots against each other and report win rates
      --p1, --p2 <bot>    bot:random or bot:greedy (default: greedy vs random)
      -n <games>          Number of games (default: 100); sides swap every game
      --map, --seed, --max-rounds as for play
      --json              Print the result as JSON
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    map: { type: "string", default: "skirmish" },
    p1: { type: "string", default: "human" },
    p2: { type: "string" },
    n: { type: "string", short: "n" },
    json: { type: "boolean", default: false },
    seed: { type: "string" },
    "max-rounds": { type: "string" },
    out: { type: "string" },
    watch: { type: "boolean", default: false },
  },
});
const [command, arg] = positionals;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function integer(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) fail(`--${name} must be an integer, got ${value}`);
  return n;
}

function loadScenario(name: string): string {
  const builtIn = MAPS[name];
  if (builtIn) return builtIn;
  if (existsSync(name)) return readFileSync(name, "utf8");
  fail(`no built-in map or file called "${name}"; built-in maps: ${Object.keys(MAPS).join(", ")}`);
}

async function play(): Promise<void> {
  const seed = integer(values.seed, "seed") ?? Math.floor(Math.random() * 2 ** 31);
  const maxRounds = integer(values["max-rounds"], "max-rounds");
  const setup: MatchSetup = {
    ...parseScenario(loadScenario(values.map)),
    seed,
    ...(maxRounds === undefined ? {} : { maxRounds }),
  };
  // Each side gets its own bot seed, so bot vs bot is not a mirror match.
  const players = [
    createPlayer(values.p1, seed),
    createPlayer(values.p2 ?? "bot:greedy", seed + 1),
  ];
  const anyHuman = players.some((p) => p.human);
  const verbose = values.watch || anyHuman;

  let state = createMatch(setup);
  const recorder = new ReplayRecorder(setup, state);
  console.log(`evt rules ${RULES_VERSION} · map ${values.map} · seed ${seed}`);
  console.log(`team 0: ${players[0]?.name} · team 1: ${players[1]?.name}`);

  try {
    while (!state.result) {
      const team = (activeUnit(state) as { team: number }).team;
      const player = players[team];
      if (!player) fail(`no player for team ${team}`);
      if (verbose && !player.human && state.turn.moved === false && state.turn.acted === false) {
        console.log(`\n${renderStatus(state)}\n${renderBoard(state)}`);
      }
      const action = await player.chooseAction(state, team);
      const result = apply(state, action);
      state = result.state;
      recorder.record(action, state);
      if (verbose) for (const e of result.events) console.log(`  ${describeEvent(e)}`);
    }
  } catch (e) {
    if (!(e instanceof Quit)) throw e;
    console.log("quit");
  } finally {
    for (const p of players) p.close?.();
  }

  console.log(
    `\n${renderStatus(state)}\n${renderBoard(state)}\n${LEGEND}\n\n${renderUnits(state)}`,
  );
  const replay = recorder.toJSON();
  console.log(`\n${describeResult(state)} after ${replay.actions.length} actions`);
  if (values.out) {
    writeFileSync(values.out, `${JSON.stringify(replay, null, 2)}\n`);
    console.log(`replay saved to ${values.out}`);
  }
}

function replay(file: string | undefined): void {
  if (!file) fail("usage: evt replay <file>");
  const data = JSON.parse(readFileSync(file, "utf8")) as Replay;
  const check = verifyReplay(data);
  if (!check.ok) fail(`replay diverges at step ${check.step}: ${check.reason}`);
  if (values.watch) {
    let state = createMatch(data.setup);
    for (const action of data.actions) {
      const result = apply(state, action);
      state = result.state;
      for (const e of result.events) console.log(describeEvent(e));
    }
    console.log(`\n${renderBoard(state)}\n\n${renderUnits(state)}`);
  }
  console.log(
    `ok: ${data.actions.length} actions, round ${check.state.round}, ${describeResult(check.state)}`,
  );
}

function sim(): void {
  const maxRounds = integer(values["max-rounds"], "max-rounds");
  const options = {
    setup: {
      ...parseScenario(loadScenario(values.map)),
      ...(maxRounds === undefined ? {} : { maxRounds }),
    },
    p1: values.p1 === "human" ? "bot:greedy" : values.p1,
    p2: values.p2 ?? "bot:random",
    games: integer(values.n, "n") ?? 100,
    seed: integer(values.seed, "seed") ?? 1,
  };
  for (const p of [options.p1, options.p2]) {
    if (!PLAYER_NAMES.includes(p) || p === "human") fail(`sim needs bots, got "${p}"`);
  }
  const progress = !values.json && process.stderr.isTTY;
  const result = simulate(options, (done) => {
    if (progress) process.stderr.write(`\r${done}/${options.games}`);
  });
  if (progress) process.stderr.write("\r");
  if (values.json) {
    const { setup: _, ...rest } = options;
    console.log(JSON.stringify({ ...rest, map: values.map, ...result }));
  } else {
    console.log(formatSim(options, result));
  }
}

switch (command) {
  case "version":
    console.log(`rules ${RULES_VERSION}`);
    break;
  case "maps":
    for (const name of Object.keys(MAPS)) console.log(name);
    break;
  case "play":
    await play();
    break;
  case "replay":
    replay(arg);
    break;
  case "sim":
    sim();
    break;
  case undefined:
    console.log(USAGE);
    break;
  default:
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    process.exitCode = 1;
}
