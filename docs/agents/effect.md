# Effect

Effect is a **server-side concern only**. `apps/server`, `packages/db`, and
`packages/env` use it. `apps/web` and `packages/ui` do not, and must not — the
browser talks to the server over HTTP and keeps plain React state.

## Where to read the API

The installed `effect` package ships its own agent documentation. Read it there
rather than searching the web, because it is versioned with the dependency:

- `node_modules/effect/AGENTS.md` — idioms for `Effect.gen`, `Effect.fn`,
  services, errors, layers, and testing.
- `node_modules/effect/ai-docs/src/**` — runnable examples, one per topic.
- `node_modules/effect/src/**` — the source.

The `effect-docs` MCP server is configured in `.mcp.json` (Claude Code) and
`.codex/config.toml` (Codex) for searchable docs. `.mcp.json` pins the version:
`bunx effect-mcp@latest` re-resolves on every start and can exceed the 30s MCP
connect timeout on a cold `bunx` cache.

## Version

`effect@4.0.0-rc.112`, the v4 "smol" line: one package. Submodules live under
`effect/unstable/*` (`schema`, `http`, `httpapi`, `sql`, `ai`, `rpc`). Do not
add `@effect/platform` or `@effect/schema` — those are v3 packages.

## Conventions

- Errors are `Schema.TaggedError`. Never `extends Error`.
- Services are `Context.Service` classes with a `static readonly layer`.
  The service id is the package name plus the path to the file, e.g.
  `"@english-prompt-evaluation/db/Database"`.
- Functions returning an Effect use `Effect.fn("Name.method")`.
- Configuration is read with `Config`, never `process.env`.
- Elysia stays the HTTP edge. Handlers own no policy: they call
  `runtime.runPromise(...)` on a `ManagedRuntime` built from the app layer
  (`apps/server/src/index.ts`).
- Drizzle stays the query vocabulary. `Database` owns the connection lifecycle
  and converts rejected queries into `DatabaseError`.

## Feedback loop

The Effect language service runs inside `tsc`, so Effect diagnostics appear in
ordinary type checking:

```bash
bun run check-types           # tsc, including Effect diagnostics
bun run check:effect          # effect-tsgo diagnostics, per workspace
bun run lint:effect           # oxlint type-aware Effect rules
bun run test                  # vitest, Effect suites use @effect/vitest
```

`bun run check` (ultracite) and `oxlint.config.ts` stay Effect-free so the
React workspaces are not linted against Effect rules. Effect's type-aware rules
live in `oxlint.effect.config.ts` because `options.typeAware` is a whole-config
switch.

`@effect/tsgo` requires `typescript@7` and pins the Oxlint version it patches.
Bumping either one alone will break `bun install`; check the support matrix in
`node_modules/@effect/tsgo/README.md` first.
