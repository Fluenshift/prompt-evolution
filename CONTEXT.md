# Prompt Evolution — domain language

Prompt Evolution helps an English learner find and reduce recurring writing
mistakes in the prompts they write. This glossary is the vocabulary for code,
tests, and UI, independent of any interface. Evaluation policy is
`docs/product/RUBRIC.md`.

**Learner** — the person using Prompt Evolution on their own writing.
_Not: user, account, customer._

**Writing Sample** — an immutable text sample deliberately submitted for
evaluation. May be a prompt meant for another tool and may mix languages; only
its English Passages are judged. Identical text submitted twice produces two
Writing Samples, because each submission is a new point in history.
_Not: prompt submission, request, query, message._

**English Passage** — a meaning-bearing span of natural-language English
inside a Writing Sample. Non-English text and Protected Technical Content are
excluded, even when the latter contains English words.
_Not: target text, eligible region._

**Evaluation** — an assessment of one Writing Sample's English Passages under
one Rubric Version: Overall Score, Proficiency Band, corrected version, and
zero or more Findings and Suggestions. Never judges prompt effectiveness,
instruction quality, or likely model performance.
_Not: review, analysis, result._

**Overall Score** — 0–100 summary of English-writing quality under one Rubric
Version. An interpretation aid, not a certification or a Finding count.
_Not: grade, percentage correct, CEFR score._

**Proficiency Band** — the named range explaining a score in plain language:
Needs revision, Understandable, Clear, Natural.
_Not: level, grade, CEFR level._

**Finding** — one demonstrable English-writing error, with its Error Category,
Finding Severity, original text, Correction, and explanation. A
context-dependent preference is not a Finding.
_Not: feedback item, issue, mistake record._

**Finding Severity** — the error's effect on reading and meaning: Minor,
Moderate, or Major. Depends on effect, never on Error Category.
_Not: priority, confidence, category weight._

**Suggestion** — an explicitly non-error alternative for wording that depends
on unstated context or intended nuance. Explains why no definitive judgment is
possible, and never affects corrected text, score, band, or Progress Insights.
_Not: Finding, Correction, recommendation score._

**Error Category** — the fixed classification grouping comparable Findings.
Rubric Version 1 permits only Spelling, Article, Verb form/tense, Preposition,
Word choice, Grammar/syntax, Punctuation/capitalization, Clarity, and Other.
_Not: error type, label._

**Correction** — the replacement for a demonstrable error. Preserves intended
meaning, non-English text, and Protected Technical Content rather than
optimizing style or prompt strategy.
_Not: rewrite, fix._

**Protected Technical Content** — code, structured data, commands, paths,
identifiers, or logs inside a Writing Sample. Excluded from correction and
preserved byte-for-byte.
_Not: writing, prose._

**Progress Insight** — a normalized or descriptive observation derived from
Evaluations over a period: Findings per 100 evaluated English words, category
recurrence, average score, distribution, recurring Corrections.
_Not: statistic, metric, trend._

**Rubric Version** — the identifiable evaluation policy that produced an
Evaluation. Versions are incompatible by default, comparable only through an
explicit compatibility declaration.
_Not: system prompt version, evaluator version._
