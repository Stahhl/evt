# Elemental Voxel Tactics

Turn-based elemental tactics on a voxel grid. Rules engine first, frontends second.
See [docs/tech-stack.md](docs/tech-stack.md) for the technology choices and why.

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
| `pnpm evt version` | Run the CLI |
| `pnpm --filter @evt/server cf-typegen` | Regenerate Worker types after changing `wrangler.jsonc` |
