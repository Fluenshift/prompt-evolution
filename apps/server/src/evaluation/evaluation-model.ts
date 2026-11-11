import { Context, Layer, Schema } from "effect";
import type { Effect } from "effect";

import { ERROR_CATEGORIES } from "./rubric-v1";
import type { ErrorCategory, FindingSeverity } from "./rubric-v1";

export interface AssessmentSpan {
  readonly byteEnd: number;
  readonly byteStart: number;
  readonly originalText: string;
}

export interface AssessmentFinding extends AssessmentSpan {
  readonly category: ErrorCategory;
  readonly correction: string;
  readonly explanation: string;
  readonly severity: FindingSeverity;
}

export interface AssessmentSuggestion extends AssessmentSpan {
  readonly alternative?: string;
  readonly explanation: string;
}

export interface ModelAssessment {
  readonly findings: readonly AssessmentFinding[];
  readonly nonEnglishSpans: readonly AssessmentSpan[];
  readonly suggestions: readonly AssessmentSuggestion[];
  readonly summary: string;
}

export interface ModelEvaluation {
  readonly assessment: unknown;
  readonly inputTokens?: number;
  readonly latencyMilliseconds: number;
  readonly model: string;
  readonly outputTokens?: number;
  readonly provider: string;
}

const spanFields = {
  byteEnd: Schema.Natural,
  byteStart: Schema.Natural,
  originalText: Schema.NonEmptyString,
};

export const MeaningfulTextSchema = Schema.String.check(
  Schema.isPattern(/\S/u, {
    expected: "a string containing non-whitespace text",
  })
);

export const ModelAssessmentSchema = Schema.Struct({
  findings: Schema.Array(
    Schema.Struct({
      ...spanFields,
      category: Schema.Literals(ERROR_CATEGORIES),
      correction: Schema.String,
      explanation: MeaningfulTextSchema,
      severity: Schema.Literals(["Minor", "Moderate", "Major"]),
    })
  ),
  nonEnglishSpans: Schema.Array(Schema.Struct(spanFields)),
  suggestions: Schema.Array(
    Schema.Struct({
      ...spanFields,
      alternative: Schema.optionalKey(Schema.String),
      explanation: MeaningfulTextSchema,
    })
  ),
  summary: MeaningfulTextSchema,
});

export class InvalidAssessmentError extends Schema.TaggedError<InvalidAssessmentError>()(
  "InvalidAssessmentError",
  { reason: Schema.String }
) {}

export class EvaluationModelError extends Schema.TaggedError<EvaluationModelError>()(
  "EvaluationModelError",
  {
    kind: Schema.Literals([
      "configuration",
      "invalid-assessment",
      "provider-credits-exhausted",
      "provider-output-incomplete",
      "provider-rate-limited",
      "provider-rejected",
      "provider-timeout",
      "provider-unavailable",
    ]),
    reason: Schema.String,
    recoverable: Schema.Boolean,
  }
) {}

export class EvaluationModel extends Context.Service<
  EvaluationModel,
  {
    readonly configured: boolean;
    readonly evaluate: (
      writingSample: string,
      protectedSpans?: readonly AssessmentSpan[]
    ) => Effect.Effect<ModelEvaluation, EvaluationModelError>;
    readonly model: string;
    readonly provider: string;
  }
>()("@english-prompt-evaluation/server/EvaluationModel") {
  static fake(
    evaluate: (
      writingSample: string,
      protectedSpans?: readonly AssessmentSpan[]
    ) => Effect.Effect<ModelEvaluation, EvaluationModelError>
  ) {
    return Layer.succeed(
      EvaluationModel,
      EvaluationModel.of({
        configured: true,
        evaluate,
        model: "deterministic-test-model",
        provider: "test",
      })
    );
  }
}
