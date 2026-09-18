# Use Effect for server-side code

`apps/server`, `packages/db`, and `packages/env` use Effect v4; `apps/web` and
`packages/ui` stay free of it. This narrows the earlier decision that Zod was
the single validation vocabulary — Zod stays the browser's, while server
configuration, domain models, untrusted model output, and typed failures move
to Effect `Schema` and `Config`.

The reason is a deliberate experiment: to see whether coding agents produce
more reliable server code when the type system carries error and dependency
information explicitly. The cost is a release-candidate dependency, the
TypeScript 7 requirement imposed by `@effect/tsgo`, and two validation
vocabularies in one repo. Elysia stays the HTTP edge and Drizzle the query
vocabulary, wrapped by Effect services rather than replaced, so deployment
topology and persistence are unchanged. Conventions: `docs/agents/effect.md`.
