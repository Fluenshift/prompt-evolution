# Agent notes

## Domain

`CONTEXT.md` is the glossary — use its vocabulary in code, tests, and UI.
Decisions live in `docs/adr/`; surface conflicts with an ADR instead of
working around it. Evaluation policy is `docs/product/RUBRIC.md`; the MVP
contract is `docs/product/REQUIREMENTS.md`.

## Effect

Server-side only: `apps/server`, `packages/db`, `packages/env`. Never in
`apps/web` or `packages/ui`. See `docs/agents/effect.md`.

## Issues

Issues and specs are local Markdown under `.scratch/<feature-slug>/`: spec at
`spec.md`, tickets at `issues/<NN>-<slug>.md`. Triage state is a `Status:`
line near the top — `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, or `wontfix`. Comments append under `## Comments`.

Delete a feature directory once its work ships; the history belongs in git,
not in a growing comment log.
