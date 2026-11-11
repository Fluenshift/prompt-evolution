import { Database } from "@english-prompt-evaluation/db";
import {
  evaluations,
  findings,
  suggestions,
} from "@english-prompt-evaluation/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  ErrorCategory,
  FindingSeverity,
  ProficiencyBand,
} from "../evaluation/rubric-v1";

export interface EvaluationFinding {
  readonly byteEnd: number;
  readonly byteStart: number;
  readonly category: ErrorCategory;
  readonly correction: string;
  readonly explanation: string;
  readonly originalText: string;
  readonly severity: FindingSeverity;
}

export interface EvaluationSuggestion {
  readonly alternative?: string;
  readonly byteEnd: number;
  readonly byteStart: number;
  readonly explanation: string;
  readonly originalText: string;
}

export interface Evaluation {
  readonly band: ProficiencyBand;
  readonly correctedText: string;
  readonly evaluatedAt: string;
  readonly evaluatedEnglishWordCount: number;
  readonly findings: readonly EvaluationFinding[];
  readonly id: string;
  readonly model: string;
  readonly originalText: string;
  readonly provider: string;
  readonly rubricVersion: string;
  readonly score: number;
  readonly suggestions: readonly EvaluationSuggestion[];
  readonly summary: string;
}

export type EvaluationSummary = Pick<
  Evaluation,
  "band" | "evaluatedAt" | "id" | "rubricVersion" | "score" | "summary"
>;

export interface PersistEvaluationInput {
  readonly contentHash: string;
  readonly evaluation: Evaluation;
  readonly inputTokens?: number;
  readonly latencyMilliseconds: number;
  readonly outputTokens?: number;
  readonly submittedAt: string;
}

const toEvaluation = (
  row: typeof evaluations.$inferSelect,
  findingRows: readonly (typeof findings.$inferSelect)[],
  suggestionRows: readonly (typeof suggestions.$inferSelect)[]
): Evaluation => ({
  band: row.band as ProficiencyBand,
  correctedText: row.correctedText,
  evaluatedAt: row.evaluatedAt,
  evaluatedEnglishWordCount: row.evaluatedEnglishWordCount,
  findings: findingRows.map((finding) => ({
    byteEnd: finding.byteEnd,
    byteStart: finding.byteStart,
    category: finding.category as ErrorCategory,
    correction: finding.correction,
    explanation: finding.explanation,
    originalText: finding.originalText,
    severity: finding.severity as FindingSeverity,
  })),
  id: row.id,
  model: row.model,
  originalText: row.originalText,
  provider: row.provider,
  rubricVersion: row.rubricVersion,
  score: row.score,
  suggestions: suggestionRows.map((suggestion) => ({
    ...(suggestion.alternative === null
      ? {}
      : { alternative: suggestion.alternative }),
    byteEnd: suggestion.byteEnd,
    byteStart: suggestion.byteStart,
    explanation: suggestion.explanation,
    originalText: suggestion.originalText,
  })),
  summary: row.summary,
});

export const persistEvaluation = Effect.fn("LearningHistory.persistEvaluation")(
  function* ({
    contentHash,
    evaluation,
    inputTokens,
    latencyMilliseconds,
    outputTokens,
    submittedAt,
  }: PersistEvaluationInput) {
    const database = yield* Database;
    yield* database.run((client) =>
      client.transaction((transaction) => {
        transaction
          .insert(evaluations)
          .values({
            band: evaluation.band,
            contentHash,
            correctedText: evaluation.correctedText,
            evaluatedAt: evaluation.evaluatedAt,
            evaluatedEnglishWordCount: evaluation.evaluatedEnglishWordCount,
            id: evaluation.id,
            inputTokens,
            latencyMilliseconds,
            model: evaluation.model,
            originalText: evaluation.originalText,
            outputTokens,
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
                alternative: suggestion.alternative,
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
      })
    );
  }
);

export const listEvaluations = Effect.fn("LearningHistory.listEvaluations")(
  function* () {
    const database = yield* Database;
    return yield* database.run((client) =>
      client
        .select({
          band: evaluations.band,
          evaluatedAt: evaluations.evaluatedAt,
          id: evaluations.id,
          rubricVersion: evaluations.rubricVersion,
          score: evaluations.score,
          summary: evaluations.summary,
        })
        .from(evaluations)
        .orderBy(desc(evaluations.evaluatedAt), desc(sql`rowid`))
        .all()
        .map((row) => ({ ...row, band: row.band as ProficiencyBand }))
    );
  }
);

export const getEvaluation = Effect.fn("LearningHistory.getEvaluation")(
  function* (evaluationId: string) {
    const database = yield* Database;
    return yield* database.run((client) => {
      const row = client
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, evaluationId))
        .get();
      if (row === undefined) {
        return null;
      }
      const findingRows = client
        .select()
        .from(findings)
        .where(eq(findings.evaluationId, evaluationId))
        .orderBy(asc(findings.position))
        .all();
      const suggestionRows = client
        .select()
        .from(suggestions)
        .where(eq(suggestions.evaluationId, evaluationId))
        .orderBy(asc(suggestions.position))
        .all();
      return toEvaluation(row, findingRows, suggestionRows);
    });
  }
);

export const deleteEvaluation = Effect.fn("LearningHistory.deleteEvaluation")(
  function* (evaluationId: string) {
    const database = yield* Database;
    yield* database.run((client) =>
      client.transaction((transaction) => {
        transaction
          .delete(evaluations)
          .where(eq(evaluations.id, evaluationId))
          .run();
      })
    );
  }
);
