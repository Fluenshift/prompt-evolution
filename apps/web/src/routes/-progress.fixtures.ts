import type { Evaluation } from "@/features/evaluations/evaluation-client";

export const PROGRESS_CLOCK = "2026-09-03T12:00:00.000Z";

/** Inside the last 7 days, the last 30 days, and all history. */
export const withinSevenDaysEvaluation = {
  band: "Natural",
  correctedText: "Explain why the test fails.",
  evaluatedAt: "2026-09-02T12:00:00.000Z",
  evaluatedEnglishWordCount: 100,
  findings: [
    {
      category: "Spelling",
      correction: "test",
      explanation: "The letters were reversed.",
      originalText: "tset",
      severity: "Minor",
    },
  ],
  id: "within-seven-days",
  model: "fixture-model",
  originalText: "Explain why the tset fails.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score: 90,
  suggestions: [
    {
      alternative: "might",
      explanation: "The best modal depends on intended certainty.",
      originalText: "could",
    },
  ],
  summary: "One spelling correction",
} satisfies Evaluation;

/** Outside the last 7 days, inside the last 30 days and all history. */
export const withinThirtyDaysEvaluation = {
  band: "Clear",
  correctedText: "Test whether the documentation is complete.",
  evaluatedAt: "2026-08-20T12:00:00.000Z",
  evaluatedEnglishWordCount: 100,
  findings: [
    {
      category: "Spelling",
      correction: "test",
      explanation: "The letters were reversed.",
      originalText: "tset",
      severity: "Minor",
    },
    {
      category: "Article",
      correction: "the documentation",
      explanation: "The specific document needs an article.",
      originalText: "documentation",
      severity: "Moderate",
    },
  ],
  id: "within-thirty-days",
  model: "fixture-model",
  originalText: "Tset whether documentation is complete.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score: 70,
  suggestions: [],
  summary: "Spelling and article corrections",
} satisfies Evaluation;

/** Outside both windows, inside all history. */
export const olderHistoryEvaluation = {
  band: "Understandable",
  correctedText: "The result depends on configuration.",
  evaluatedAt: "2026-05-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 200,
  findings: [
    {
      category: "Preposition",
      correction: "depend on",
      explanation: "This verb takes the preposition on.",
      originalText: "depend of",
      severity: "Moderate",
    },
  ],
  id: "older-history",
  model: "fixture-model",
  originalText: "The result depend of configuration.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score: 50,
  suggestions: [],
  summary: "One preposition correction",
} satisfies Evaluation;

/** Recent, but produced under an incompatible Rubric Version. */
export const incompatibleRubricEvaluation = {
  band: "Needs revision",
  correctedText: "Corrected under another rubric.",
  evaluatedAt: "2026-09-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 50,
  findings: [
    {
      category: "Clarity",
      correction: "the request",
      explanation: "The subject was ambiguous.",
      originalText: "it",
      severity: "Major",
    },
  ],
  id: "incompatible-rubric",
  model: "fixture-model",
  originalText: "Original under another rubric.",
  provider: "Fixture provider",
  rubricVersion: "2",
  score: 20,
  suggestions: [],
  summary: "Incompatible rubric evidence",
} satisfies Evaluation;

export const progressEvaluations = [
  olderHistoryEvaluation,
  incompatibleRubricEvaluation,
  withinThirtyDaysEvaluation,
  withinSevenDaysEvaluation,
] as const;

/** Two Findings share one Error Category inside a single Evaluation. */
export const duplicateCategoryEvaluation = {
  band: "Clear",
  correctedText: "Receive the separate documentation.",
  evaluatedAt: "2026-09-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 100,
  findings: [
    {
      category: "Spelling",
      correction: "receive",
      explanation: "The vowel order was incorrect.",
      originalText: "recieve",
      severity: "Minor",
    },
    {
      category: "Spelling",
      correction: "separate",
      explanation: "The second vowel is an a.",
      originalText: "seperate",
      severity: "Minor",
    },
    {
      category: "Article",
      correction: "the documentation",
      explanation: "The specific document needs an article.",
      originalText: "documentation",
      severity: "Moderate",
    },
  ],
  id: "duplicate-category",
  model: "fixture-model",
  originalText: "Recieve seperate documentation.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score: 80,
  suggestions: [],
  summary: "Repeated spelling corrections",
} satisfies Evaluation;
