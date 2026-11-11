import { createHash } from "node:crypto";

import { Database } from "@english-prompt-evaluation/db";
import {
  evaluations,
  findings,
  suggestions,
} from "@english-prompt-evaluation/db/schema";
import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Effect, Layer } from "effect";

import { RUBRIC_VERSION } from "../evaluation/rubric-v1";
import type {
  ErrorCategory,
  FindingSeverity,
  ProficiencyBand,
} from "../evaluation/rubric-v1";
import type {
  Evaluation,
  EvaluationFinding,
  EvaluationSuggestion,
} from "../history/learning-history";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const byteSpan = (source: string, originalText: string, occurrence = 0) => {
  let searchFrom = 0;
  let matchIndex = -1;

  for (let match = 0; match <= occurrence; match += 1) {
    matchIndex = source.indexOf(originalText, searchFrom);
    if (matchIndex === -1) {
      throw new Error(`Text not found in mock Writing Sample: ${originalText}`);
    }
    searchFrom = matchIndex + originalText.length;
  }

  const byteStart = Buffer.byteLength(source.slice(0, matchIndex), "utf-8");
  return {
    byteEnd: byteStart + Buffer.byteLength(originalText, "utf-8"),
    byteStart,
  };
};

const mockFinding = (
  source: string,
  originalText: string,
  correction: string,
  category: ErrorCategory,
  severity: FindingSeverity,
  explanation: string,
  occurrence?: number
): EvaluationFinding => ({
  ...byteSpan(source, originalText, occurrence),
  category,
  correction,
  explanation,
  originalText,
  severity,
});

const mockSuggestion = (
  source: string,
  originalText: string,
  explanation: string,
  alternative?: string
): EvaluationSuggestion => ({
  ...byteSpan(source, originalText),
  ...(alternative === undefined ? {} : { alternative }),
  explanation,
  originalText,
});

interface MockEvaluationInput {
  readonly band: ProficiencyBand;
  readonly correctedText: string;
  readonly daysAgo: number;
  readonly evaluatedEnglishWordCount: number;
  readonly findings: readonly EvaluationFinding[];
  readonly id: string;
  readonly originalText: string;
  readonly rubricVersion?: string;
  readonly score: number;
  readonly suggestions: readonly EvaluationSuggestion[];
  readonly summary: string;
}

const makeEvaluation = ({
  band,
  correctedText,
  evaluatedAt,
  evaluatedEnglishWordCount,
  findings: evaluationFindings,
  id,
  originalText,
  rubricVersion = RUBRIC_VERSION,
  score,
  suggestions: evaluationSuggestions,
  summary,
}: Omit<MockEvaluationInput, "daysAgo"> & {
  evaluatedAt: string;
}): Evaluation => ({
  band,
  correctedText,
  evaluatedAt,
  evaluatedEnglishWordCount,
  findings: evaluationFindings,
  id,
  model: "mock-local-evaluator",
  originalText,
  provider: "Local mock data",
  rubricVersion,
  score,
  suggestions: evaluationSuggestions,
  summary,
});

const buildMockEvaluations = (now: Date) => {
  const evaluatedAt = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * DAY_IN_MILLISECONDS).toISOString();

  const inputs: readonly MockEvaluationInput[] = [
    {
      band: "Clear",
      correctedText: "I want to receive clear answers about this task.",
      daysAgo: 1,
      evaluatedEnglishWordCount: 9,
      findings: [
        mockFinding(
          "I want to recieve clear answers about this task.",
          "recieve",
          "receive",
          "Spelling",
          "Minor",
          "The letters i and e are reversed in receive."
        ),
      ],
      id: "mock-repeated-spelling",
      originalText: "I want to recieve clear answers about this task.",
      score: 82,
      suggestions: [
        mockSuggestion(
          "I want to recieve clear answers about this task.",
          "clear answers",
          "Concise is more specific if brevity is your goal.",
          "concise answers"
        ),
      ],
      summary: "One spelling error.",
    },
    {
      band: "Understandable",
      correctedText:
        "Explain to me how to improve the prompt and give an example.",
      daysAgo: 3,
      evaluatedEnglishWordCount: 11,
      findings: [
        mockFinding(
          "Explain me how to improve the prompt and give example.",
          "Explain me",
          "Explain to me",
          "Preposition",
          "Minor",
          "Explain takes to before the person receiving the explanation."
        ),
        mockFinding(
          "Explain me how to improve the prompt and give example.",
          "give example",
          "give an example",
          "Article",
          "Minor",
          "A singular count noun needs an article here."
        ),
      ],
      id: "mock-article-preposition",
      originalText: "Explain me how to improve the prompt and give example.",
      score: 68,
      suggestions: [],
      summary: "Two grammar errors make the request less natural.",
    },
    {
      band: "Understandable",
      correctedText:
        "This approach depends on the context, and the examples are confusing.",
      daysAgo: 6,
      evaluatedEnglishWordCount: 12,
      findings: [
        mockFinding(
          "This approach depend of the context, and the examples is confusing.",
          "depend of",
          "depends on",
          "Preposition",
          "Moderate",
          "This expression uses depends on, not depend of."
        ),
        mockFinding(
          "This approach depend of the context, and the examples is confusing.",
          "examples is",
          "examples are",
          "Verb form/tense",
          "Minor",
          "The plural subject examples needs are."
        ),
      ],
      id: "mock-recurring-verb",
      originalText:
        "This approach depend of the context, and the examples is confusing.",
      score: 62,
      suggestions: [],
      summary: "Two agreement errors make the request harder to read.",
    },
    {
      band: "Natural",
      correctedText: "Explain how caching reduces repeated database work.",
      daysAgo: 10,
      evaluatedEnglishWordCount: 8,
      findings: [],
      id: "mock-no-errors",
      originalText: "Explain how caching reduces repeated database work.",
      score: 100,
      suggestions: [
        mockSuggestion(
          "Explain how caching reduces repeated database work.",
          "repeated database work",
          "This alternative is more concrete in a technical context.",
          "duplicate database queries"
        ),
      ],
      summary: "No errors found.",
    },
    {
      band: "Understandable",
      correctedText: "Please make the explanation better and explain errors.",
      daysAgo: 14,
      evaluatedEnglishWordCount: 12,
      findings: [
        mockFinding(
          "Please make the explanation more good and tell me things about errors.",
          "more good",
          "better",
          "Word choice",
          "Moderate",
          "Better is the natural comparative form of good."
        ),
        mockFinding(
          "Please make the explanation more good and tell me things about errors.",
          "tell me things about",
          "explain",
          "Clarity",
          "Minor",
          "Explain states the requested action more directly."
        ),
      ],
      id: "mock-clarity",
      originalText:
        "Please make the explanation more good and tell me things about errors.",
      score: 55,
      suggestions: [],
      summary: "Two vague or unnatural phrases.",
    },
    {
      band: "Clear",
      correctedText: "The documentation describes how the service works.",
      daysAgo: 45,
      evaluatedEnglishWordCount: 8,
      findings: [
        mockFinding(
          "The documentation describe how the service work.",
          "documentation describe",
          "documentation describes",
          "Verb form/tense",
          "Minor",
          "The singular subject documentation needs describes."
        ),
        mockFinding(
          "The documentation describe how the service work.",
          "service work",
          "service works",
          "Verb form/tense",
          "Minor",
          "The singular subject service needs works."
        ),
      ],
      id: "mock-older-agreement",
      originalText: "The documentation describe how the service work.",
      score: 75,
      suggestions: [],
      summary: "Two agreement errors.",
    },
    {
      band: "Clear",
      correctedText: "This sentence has a mistake.",
      daysAgo: 8,
      evaluatedEnglishWordCount: 5,
      findings: [
        mockFinding(
          "This sentence have a mistake.",
          "sentence have",
          "sentence has",
          "Verb form/tense",
          "Minor",
          "The singular subject sentence needs has."
        ),
      ],
      id: "mock-legacy-rubric",
      originalText: "This sentence have a mistake.",
      rubricVersion: "0",
      score: 70,
      suggestions: [],
      summary: "One agreement error in this older rubric.",
    },
  ];

  return inputs.map(({ daysAgo, ...input }) => {
    const timestamp = evaluatedAt(daysAgo);
    return {
      evaluation: makeEvaluation({ ...input, evaluatedAt: timestamp }),
      submittedAt: new Date(Date.parse(timestamp) - 60_000).toISOString(),
    };
  });
};

const seed = async () => {
  const records = buildMockEvaluations(new Date());
  const ids = records.map(({ evaluation }) => evaluation.id);
  const layer = Database.layer.pipe(Layer.provide(ServerConfig.layer));

  await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      yield* database.run((client) => {
        client.$client.run(
          `DELETE FROM findings WHERE evaluation_id IN (${ids.map(() => "?").join(", ")})`,
          ids
        );
        client.$client.run(
          `DELETE FROM suggestions WHERE evaluation_id IN (${ids.map(() => "?").join(", ")})`,
          ids
        );
        client.$client.run(
          `DELETE FROM evaluations WHERE id IN (${ids.map(() => "?").join(", ")})`,
          ids
        );

        client.transaction((transaction) => {
          for (const { evaluation, submittedAt } of records) {
            transaction
              .insert(evaluations)
              .values({
                band: evaluation.band,
                contentHash: createHash("sha256")
                  .update(evaluation.originalText)
                  .digest("hex"),
                correctedText: evaluation.correctedText,
                evaluatedAt: evaluation.evaluatedAt,
                evaluatedEnglishWordCount: evaluation.evaluatedEnglishWordCount,
                id: evaluation.id,
                inputTokens: 100,
                latencyMilliseconds: 250,
                model: evaluation.model,
                originalText: evaluation.originalText,
                outputTokens: 80,
                provider: evaluation.provider,
                rubricVersion: evaluation.rubricVersion,
                score: evaluation.score,
                submittedAt,
                summary: evaluation.summary,
              })
              .run();

            if (evaluation.findings.length > 0) {
              transaction
                .insert(findings)
                .values(
                  evaluation.findings.map((finding, position) => ({
                    ...finding,
                    evaluationId: evaluation.id,
                    position,
                  }))
                )
                .run();
            }

            if (evaluation.suggestions.length > 0) {
              transaction
                .insert(suggestions)
                .values(
                  evaluation.suggestions.map((suggestion, position) => ({
                    alternative: suggestion.alternative ?? null,
                    byteEnd: suggestion.byteEnd,
                    byteStart: suggestion.byteStart,
                    evaluationId: evaluation.id,
                    explanation: suggestion.explanation,
                    originalText: suggestion.originalText,
                    position,
                  }))
                )
                .run();
            }
          }
        });
      });
    }).pipe(Effect.provide(layer))
  );

  console.log(`Seeded ${records.length} mock evaluations in local DB.`);
};

await seed();
