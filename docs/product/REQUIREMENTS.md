# Requirements

The MVP contract. IDs are referenced by
`apps/server/src/evaluation/live-calibration-fixtures.ts`; do not renumber.
Evaluation policy itself lives in [`RUBRIC.md`](./RUBRIC.md).

## Functional

| ID | Requirement |
| --- | --- |
| FR-01 | The full journey — submit, inspect, browse, Progress, delete — works in a browser on the Linux host. |
| FR-02 | Inbound traffic is accepted through host loopback only. |
| FR-03 | No sign-up, login, session, or user administration. |
| FR-04 | Product data survives container restart or replacement. |
| FR-05 | Only deliberately submitted text is sent or stored. No background capture. |
| FR-06 | The exact submitted bytes are stored and returned unnormalized. |
| FR-07 | A stable content hash is computed; identical text may be submitted repeatedly. |
| FR-08 | Evaluate spelling, grammar, articles, verb tense, word choice, punctuation, and clarity in English Passages only. |
| FR-09 | Corrections keep technical meaning and intended tone, and leave non-English text unchanged. |
| FR-10 | Every Evaluation has an integer score 0–100, its band, and Findings carrying one approved category, one approved severity, original text, Correction, and explanation. |
| FR-11 | Zero Findings is a valid Evaluation and states that no correction is needed. |
| FR-12 | Provider, model, Rubric Version, and evaluated English word count are retained and shown. |
| FR-13 | Stored records are immutable — readable and deletable only. |
| FR-14 | History lists Evaluations newest first with date, summary, score, and band. |
| FR-15 | Opening a record shows original text, corrected text, all Findings, all Suggestions, and context. |
| FR-16 | Identical text submitted twice creates two separately addressable records. |
| FR-17 | Progress covers last 7 days, last 30 days, and all compatible history. |
| FR-18 | Finding Rate is the primary measure and shows its underlying counts. |
| FR-19 | Category Recurrence counts each sample once per category; recurring Corrections link phrase to Corrections. |
| FR-20 | Every Progress Insight reveals the exact source Findings behind it. |
| FR-21 | Finding Rate is labeled primary, score secondary, raw counts descriptive; values recompute from retained rows. |
| FR-22 | History shows each Rubric Version; Progress defaults to the current one and never merges undeclared-incompatible versions. |
| FR-23 | Retain the approved fields only. Never persist API keys, hidden reasoning, or raw HTTP bodies. See [`DATA-POLICY.md`](./DATA-POLICY.md). |
| FR-24 | Disclose local data location, receiving provider, separate provider retention, and the loopback-only rule. |
| FR-25 | Deliberate deletion removes one Evaluation with its sample, Findings, Suggestions, and metadata; Progress recalculates. |
| FR-26 | Protected Technical Content produces no Findings, is excluded from scoring, and is preserved byte-for-byte. |
| FR-27 | A sample with no meaning-bearing English Passage is rejected and stored nowhere. |
| FR-28 | Context-dependent wording gets no Finding or Correction — at most a Suggestion labeled non-error. |
| FR-29 | English inside quotes and blockquotes is evaluated normally. |

## Quality

| ID | Requirement |
| --- | --- |
| QR-01 | The same kind of error with the same effect gets the same category and severity within one Rubric Version. |
| QR-02 | Progress Insights are reproducible from retained Findings alone. |
| QR-03 | A failed or incomplete evaluation never appears as successful history. |
| QR-04 | Never imply a Writing Sample stays local when an external model receives it. |
| QR-05 | Text inside a Writing Sample cannot alter evaluator policy. |
| QR-06 | Feedback is understandable without specialist grammar terminology; necessary terms are explained. |
| QR-07 | Container defaults keep access host-only and make accidental external publication evident. |
| QR-08 | Every bundled font, icon, and visual asset has a documented license. See [`ASSET-LICENSES.md`](./ASSET-LICENSES.md). |
| QR-09 | Scoring concerns English writing only — never prompt or instruction effectiveness. |
| QR-10 | Non-English text stays unchanged and affects no score, band, Finding, or insight. |
| QR-11 | Suggestions stay visually and statistically distinct from Findings and never touch score, corrected text, or metrics. |

## Out of scope

Automatic Codex/Claude Code capture or proxying. Additional providers or
provider selection. Model-created or editable Error Categories. Accounts,
multi-user, cloud sync, public deployment, export, search, goals, streaks,
directional improvement claims, and any advice about prompt quality.
