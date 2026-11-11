# Prompt Evolution

A localhost-only writing evaluator. Submit one Writing Sample, it goes through OpenRouter to a fixed OpenAI model, and the score and corrected text are derived locally under Rubric Version 1. Evidence is kept in local SQLite; history and Progress never leave the machine.

## Requirements

- Linux host with Docker Compose, or Bun 1.4.0 (pinned by `mise.toml`)
- An OpenRouter API key
- Chromium for the browser test: `bunx playwright install chromium`

## Local development

```bash
mise install    # installs the pinned Bun
bun run setup   # locked dependencies + .data
```

Copy `apps/server/.env.example` to `apps/server/.env` and set `OPENROUTER_API_KEY`. The database defaults to `.data/local.db` from the repo root. Credentials stay server-side — never returned by the API, never bundled into browser assets.

```bash
bun run dev
```

Open <http://127.0.0.1:3001>. Vite proxies `/api` to the loopback server. Migrations run before the server reports ready.

## Docker

```bash
mkdir -p .data
bun run docker:up
```

Or use the helper: `./scripts/project.sh start|stop|status|restart|rebuild|logs|down`. `stop` keeps containers and database; `rebuild` after source or dependency changes; `down` removes containers but keeps `.data`.

Open <http://127.0.0.1:3001>. Only `127.0.0.1:3001` is published — the app has no authentication and must stay host-only. One Bun/Elysia process serves both the API and the built client. Data persists at `./.data/local.db` across container replacement.

Docker tasks map the container process to the invoking user's UID/GID so the bind mount stays writable without running as root. Calling `docker compose` directly means setting `PROMPT_EVOLUTION_UID=$(id -u)` and `PROMPT_EVOLUTION_GID=$(id -g)` yourself. `PROMPT_EVOLUTION_DATA_DIR` points the volume elsewhere; that directory must already exist and be writable.

## Privacy

- Nothing is sent or stored while typing.
- **Evaluate writing** sends the full current Writing Sample through OpenRouter with `store: false`, no tools, and no conversation state. OpenRouter does not retain prompts unless logging is enabled, but the routed provider has its own policy — this is not a fully local evaluation.
- Successful Evaluations stay in local SQLite until deliberate deletion. Failed attempts are not retained.
- Deletion cascades to Findings, Suggestions, sample, and metadata. There are no backups, so it cannot be undone.
- Setup & privacy shows the resolved data location, provider, model, and localhost boundary without revealing secrets.

Full boundary: [`docs/product/DATA-POLICY.md`](docs/product/DATA-POLICY.md).

## Verification

```bash
bun run verify       # tests, TypeScript + Effect diagnostics, lint, format, build
bun run verify:e2e   # Playwright: create → reopen → Progress → delete, real SQLite
bun run docker:smoke # loopback publication, non-loopback refusal, hostile Host/Origin,
                      # migrations, data survival across replacement, secret scan
```

`docker:smoke` uses a throwaway data directory and Compose project and cleans up after itself. None of this establishes live model accuracy.

The paid gate is separate:

```bash
CALIBRATION_SPENT_USD=<previous-total> bun run calibrate:live
```

It runs the frozen synthetic fixtures with SDK retries disabled and refuses to start if the run would cross the $3 testing budget — see
[`.scratch/testing-spend.md`](.scratch/testing-spend.md). Automated PASS is not
a substitute for reading the explanations and checking meaning and tone
yourself. Production also disables automatic retries: one attempt, 90-second
deadline, 120-second HTTP idle limit, and routed-provider prices capped at
$2/M input, $12/M output, $0 per request.

Each submitted Evaluation writes one structured `writing-evaluation` log event. It includes the outcome code, correlation ID, elapsed time, provider, model, request deadline, and output-token limit. It never includes the Writing Sample, credential, or provider request and response bodies.

`mise` only pins the toolchain; everything else runs through `bun run`. The pre-commit hook formats and lints the staged files, so `bun run check` and `bun run verify` stay the tree-wide gates.

## Layout

```text
apps/web       React, Vite, TanStack Router
apps/server    Elysia HTTP boundary and server composition
packages/db    Drizzle schema, Bun SQLite service, migrations
packages/env   Effect-based server configuration
packages/ui    Shared UI primitives
```
