# Rubric Version 1

Evaluation policy: what gets assessed, how Findings are classified, how the
score is derived, and when two Evaluations may be compared. Vocabulary is
defined in `CONTEXT.md`.

Rubric Version is immutable on a stored Evaluation. Versions are incompatible
by default; combining them in Progress requires an explicit code-level
compatibility declaration. Changing provider, model, reasoning config,
structured contract, prompt, word-count rule, or score formula defaults to a
new incompatible version. Historical rows are never rewritten.

## Scope

Assess the English writing in one Writing Sample — never prompt effectiveness,
instruction quality, task design, or likely model performance.

- Only English Passages are evaluated. Non-English text stays byte-for-byte
  unchanged and affects no score, Finding, or Progress Insight.
- A sample with no meaning-bearing English Passage is rejected; no Evaluation
  is stored.
- Protected Technical Content (fenced/inline code, structured data, commands,
  paths, identifiers, logs) is excluded from scoring and Findings, and
  preserved byte-for-byte in the corrected version.
- Quotation marks and Markdown blockquotes protect nothing. English inside
  them is evaluated normally; only Protected Technical Content is excluded.
- Judge concise technical prose in its intended context, not as formal prose.
- Never penalize one valid formulation because another could be preferable.

## Findings and Suggestions

A **Finding** is a demonstrable error. It gets one Error Category and one
Finding Severity, contributes to the corrected version, and affects the score
and Progress Insights.

A **Suggestion** is an optional alternative where correctness depends on
unstated context or intended nuance. It has no category, no severity, and no
effect on corrected text, score, band, or any Progress Insight. It must state
that the original is not confirmed wrong and name the missing context.

If uncertain whether text is erroneous, do not create a Finding. Omit it, or
create a Suggestion.

## Finding Severity

Severity describes the error's effect in its actual passage. Category never
determines severity — a Spelling error can be Minor or Major.

| Severity | Use when |
| --- | --- |
| Minor | Local; meaning stays clear with little interruption. |
| Moderate | Reading is interrupted, but meaning is recoverable without guesswork. |
| Major | Meaning becomes wrong, obscured, or hard to recover. |

## Error Categories

Exactly one per Finding, from this fixed list. The evaluator cannot invent
categories.

| Category | Use when |
| --- | --- |
| Spelling | A word is misspelled or malformed. Do not claim intent proves it was a typo. |
| Article | `a`, `an`, or `the` is missing, unnecessary, or incorrect. |
| Verb form/tense | Wrong tense, aspect, auxiliary, conjugation, or subject–verb agreement. |
| Preposition | A preposition is missing, unnecessary, or incorrect. |
| Word choice | A word is demonstrably wrong or forms an invalid collocation. If choosing among valid words needs unstated intent, use a Suggestion. |
| Grammar/syntax | Structure, pronoun use, or number agreement is wrong and no narrower category applies. |
| Punctuation/capitalization | Punctuation or letter case is incorrect. |
| Clarity | The text itself prevents a reasonable reader from recovering the meaning. Not for optional rewrites, verbosity, tone, or elegance. |
| Other | A real problem fitting nothing above. Rare; explain why. |

Precedence when a problem fits several — first applicable rule wins:

1. Spelling or Punctuation/capitalization for observable mechanics.
2. Article, Verb form/tense, or Preposition.
3. Word choice for lexical meaning or collocation.
4. Grammar/syntax for remaining structural grammar.
5. Clarity only when the text blocks interpretation.
6. Other.

Never duplicate one problem across categories. Separate Findings are fine when
one phrase holds distinct problems (missing preposition *and* wrong verb form).

## Score and bands

| Severity | Error points |
| --- | ---: |
| Minor | 3 |
| Moderate | 7 |
| Major | 12 |

With `W` = evaluated English word count, `E` = total error points, and
`D = max(W, 20)`:

```
Overall Score = clamp(round_half_up(100 - 100 × E / D), 0, 100)
```

The 20-word floor stops one local typo from dominating a short sample. It
applies to the score only — Finding Rate always uses the actual word count.

| Score | Band | Meaning |
| --- | --- | --- |
| 0–49 | Needs revision | Problems substantially obstruct meaning. |
| 50–69 | Understandable | Intent recoverable, but several problems interrupt reading. |
| 70–84 | Clear | Intent reads clearly despite limited, localized problems. |
| 85–100 | Natural | Correct or nearly correct for its technical context. |

Calibration intent — these anchors fix the weights:

| Words | Findings | Score | Band |
| ---: | --- | ---: | --- |
| 9 | none | 100 | Natural |
| 9 | 1 Minor | 85 | Natural |
| 9 | 1 Moderate | 65 | Understandable |
| 9 | 1 Major | 40 | Needs revision |
| 40 | 1 Major | 70 | Clear |

The score is derived locally, never supplied by the model. Zero Findings gives
100. Suggestions add zero. Always display the score with its band.

## English word count

Count only after Protected Technical Content and model-identified non-English
spans are excluded.

A word is one maximal run of Unicode letters and combining marks. An internal
apostrophe (ASCII or curly) or hyphen (ASCII or non-breaking) keeps the word
whole only when letters sit on both sides.

- Contractions, possessives, hyphenated compounds, letter-only acronyms: 1.
- Standalone numbers, punctuation, emoji, protected identifiers: 0.
- Case and surrounding whitespace are irrelevant.

## Progress Insights

Only successful, retained Evaluations contribute. Suggestions never enter any
calculation. Deleted Evaluations vanish from recalculated insights; repeated
Writing Samples stay separate observations.

- **Primary — Finding Rate:** `Findings / evaluated English words × 100`.
  Lower is better within one compatible version. Always shown with its
  Evaluation, word, and Finding counts.
- **Habit — Category Recurrence:** `samples containing the category /
  evaluated samples × 100`. Count each sample once per category.
- **Secondary — average Overall Score.** Model variation makes it weaker
  evidence than Finding Rate.
- **Descriptive:** raw Finding count, distribution by category, frequently
  corrected phrases with their Corrections, Evaluation and word counts.

Windows: last 7 days, last 30 days, all compatible history. Each shows its
Evaluation count. Progress defaults to the current Rubric Version and segments
incompatible versions instead of merging them.

No period is ever labeled "improved" or "declined" — the MVP shows values and
evidence only, so it needs no minimum sample size. Adding directional claims
later requires defining and validating that threshold first.
