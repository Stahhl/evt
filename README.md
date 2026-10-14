# Elemental Voxel Tactics

Turn-based elemental tactics on a voxel grid. Rules engine first, frontends second.
See [docs/tech-stack.md](docs/tech-stack.md) for the technology choices and why,
[docs/gameplay.md](docs/gameplay.md) for the game rules decided so far,
and [docs/roadmap-singleplayer-mvp.md](docs/roadmap-singleplayer-mvp.md) for the path to a playable singleplayer MVP.

## Getting started

Requires Node 24+ and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm check        # lint + typecheck + tests
```

## Packages

| Package | What it is |
|---|---|
| `packages/engine` | Pure, deterministic rules engine. No I/O, no clock, no `Math.random`. |
| `packages/protocol` | Client/server message types and zod schemas. |
| `packages/bots` | AI opponents. |
| `packages/cli` | Headless play and replay tools: `pnpm evt <command>`. |
| `packages/server` | Cloudflare Worker + one Durable Object per match: `pnpm dev:server`. |
| `packages/web` | Vite + React web client: `pnpm dev:web` (proxies `/api` to the server). |

Packages are consumed as TypeScript source; there is no build step except for the web bundle.
The CLI runs on Node's built-in TypeScript support.

## Commands

| Command | Does |
|---|---|
| `pnpm test` / `pnpm test:watch` | Vitest across all packages |
| `pnpm typecheck` | `tsc` per package |
| `pnpm lint` / `pnpm fix` | Biome check / apply fixes and formatting |
| `pnpm evt play` | Play the built-in `skirmish` map against a random bot in the terminal |
| `pnpm evt play --p1 bot:random --p2 bot:random --seed 1 --out r.json` | Bot vs bot, saving the replay |
| `pnpm evt replay r.json` | Re-run a replay and check every state hash |
| `pnpm evt maps` / `pnpm evt version` | List built-in maps / print the rules version |
| `pnpm --filter @evt/server cf-typegen` | Regenerate Worker types after changing `wrangler.jsonc` |

## Golden replays

`packages/engine/test/golden/*.json` are recorded matches. The tests replay them and compare the
state hash after every action, so any change that alters the outcome of a match fails CI.

If the change is a bug, fix it. If it is an intended rule change, bump `RULES_VERSION` in
`packages/engine/src/version.ts` and record the golden replays again:

```bash
pnpm evt play --p1 bot:random --p2 bot:random --seed 1 \
  --out packages/engine/test/golden/skirmish-random-seed1.json
```
