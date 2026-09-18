# Data policy

## Stored locally

A successful Evaluation stays in local SQLite until deliberately deleted. No
expiration.

Original Writing Sample and its content hash; submission and evaluation
timestamps; corrected version and summary; evaluated English word count; score
and band; Findings (category, severity, original text, Correction,
explanation); Suggestions (original text, optional alternative, context
explanation); provider, model, Rubric Version; token usage and latency when
the provider reports them.

## Never stored

API keys or other credentials, hidden model reasoning, raw HTTP request or
response bodies, unstructured provider output after validation.

Credentials are read server-side from `OPENROUTER_API_KEY` through Effect
Config/Redacted. They never reach browser code, history, or logs. Request
logging excludes Writing Sample text and provider bodies.

## External transmission

Evaluating sends the full current Writing Sample to OpenRouter, routed to
`openai/gpt-5.6-terra` with `store: false`, no tools, and no conversation
state. The provider receives only that sample, the rubric instructions, and
structural annotations.

OpenRouter says prompt retention is opt-in and off by default, but the routed
model provider has its own logging and retention policy. **This is not a fully
local evaluation, and the product must never describe it as one.** See
[OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
and [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging).

No telemetry or remote analytics.

## Local access boundary

The application has no authentication, so it must stay host-only. Compose
publishes to IPv4 loopback explicitly. The server also rejects unexpected Host
headers and cross-origin state-changing requests — loopback binding alone does
not stop a hostile web page from driving the local app. CORS is off.

## Deletion

Deleting an Evaluation removes its Writing Sample, Findings, Suggestions, and
metadata, and Progress recalculates without that evidence. There are no
application-managed backups, so deletion cannot be undone through the product.
Introducing backups later requires a new explicit policy.
