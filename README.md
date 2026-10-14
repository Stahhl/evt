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
| `packages/web` | Vite + React + Three.js web client: `pnpm dev:web`, then open the printed URL to play against a bot. |

Packages are consumed as TypeScript source; there is no build step except for the web bundle.
The CLI runs on Node's built-in TypeScript support.

## Commands

| Command | Does |
|---|---|
| `pnpm test` / `pnpm test:watch` | Vitest across all packages |
| `pnpm typecheck` | `tsc` per package |
| `pnpm lint` / `pnpm fix` | Biome check / apply fixes and formatting |
| `pnpm evt play` | Play against the greedy bot in the terminal (`--map highlands` or `skirmish`) |
| `pnpm evt play --p1 bot:random --p2 bot:random --seed 1 --out r.json` | Bot vs bot, saving the replay |
| `pnpm evt replay r.json` | Re-run a replay and check every state hash |
| `pnpm evt sim --p1 bot:greedy --p2 bot:random -n 200` | Bot vs bot win rates; also runs nightly in the Balance workflow |
| `pnpm evt maps` / `pnpm evt version` | List built-in maps / print the rules version |
| `pnpm --filter @evt/server cf-typegen` | Regenerate Worker types after changing `wrangler.jsonc` |

## Deploying

The Worker in `packages/server` serves the built web client as static assets, so one
`wrangler deploy` publishes both:

```bash
pnpm --filter @evt/web build
pnpm --filter @evt/server run deploy
```

CI does the same on every push to `main` once the repository has the secrets
`CLOUDFLARE_API_TOKEN` (with Workers edit rights) and `CLOUDFLARE_ACCOUNT_ID`. Without them the
deploy job is skipped.

## Golden replays

`packages/engine/test/golden/*.json` are recorded matches. The tests replay them and compare the
state hash after every action, so any change that alters the outcome of a match fails CI.

If the change is a bug, fix it. If it is an intended rule change, bump `RULES_VERSION` in
`packages/engine/src/version.ts` and record the golden replays again:

```bash
g=packages/engine/test/golden
pnpm evt play --p1 bot:random --p2 bot:random --seed 1 --out $g/skirmish-random-seed1.json
pnpm evt play --p1 bot:greedy --p2 bot:random --seed 1 --out $g/skirmish-greedy-random-seed1.json
pnpm evt play --p1 bot:greedy --p2 bot:greedy --seed 2 --out $g/skirmish-greedy-greedy-seed2.json
pnpm evt play --map highlands --p1 bot:greedy --p2 bot:greedy --seed 1 --out $g/highlands-greedy-greedy-seed1.json
```
