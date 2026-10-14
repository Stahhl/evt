#!/usr/bin/env node
// Headless entry point. Runs directly on Node's built-in TypeScript support.
import { parseArgs } from "node:util";
import { RULES_VERSION } from "@evt/engine";

const USAGE = `Usage: evt <command>

Commands:
  version   Print the rules version
`;

const { positionals } = parseArgs({ allowPositionals: true });
const [command] = positionals;

switch (command) {
  case "version":
    console.log(`rules ${RULES_VERSION}`);
    break;
  case undefined:
    console.log(USAGE);
    break;
  default:
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    process.exitCode = 1;
}
