import { createHash, randomUUID } from "node:crypto";

import { Effect, Schema } from "effect";

import { persistEvaluation } from "../history/learning-history";
import type { Evaluation } from "../history/learning-history";
import {
  EvaluationModel,
  InvalidAssessmentError,
  ModelAssessmentSchema,
} from "./evaluation-model";
import type { AssessmentSpan } from "./evaluation-model";
import { findProtectedTechnicalContent } from "./protected-content";
import {
  applyCorrections,
  countEnglishWords,
  proficiencyBandForScore,
  RUBRIC_VERSION,
  scoreEvaluation,
  UnsafeCorrectionError,
} from "./rubric-v1";
import { isUtf8ByteBoundary, isWellFormedUtf8String } from "./utf8";

export class InvalidWritingSampleError extends Schema.TaggedError<InvalidWritingSampleError>()(
  "InvalidWritingSampleError",
  { reason: Schema.String }
) {}

export class NoEnglishError extends Schema.TaggedError<NoEnglishError>()(
  "NoEnglishError",
  { reason: Schema.String }
) {}

export type { Evaluation as StoredEvaluation } from "../history/learning-history";

export const MAX_WRITING_SAMPLE_BYTES = 32 * 1024;

const overlaps = (left: AssessmentSpan, right: AssessmentSpan) =>
  left.byteStart < right.byteEnd && right.byteStart < left.byteEnd;

const validateSpan = (source: Buffer, span: AssessmentSpan) => {
  const validRange =
    Number.isInteger(span.byteStart) &&
    Number.isInteger(span.byteEnd) &&
    span.byteStart >= 0 &&
    span.byteEnd > span.byteStart &&
    span.byteEnd <= source.byteLength &&
    isUtf8ByteBoundary(source, span.byteStart) &&
    isUtf8ByteBoundary(source, span.byteEnd);

  return (
    validRange &&
    source.subarray(span.byteStart, span.byteEnd).toString("utf-8") ===
      span.originalText
  );
};

const textWithout = (source: Buffer, spans: readonly AssessmentSpan[]) => {
  const retained = Buffer.from(source);
  for (const span of spans) {
    retained.fill(0x20, span.byteStart, span.byteEnd);
  }
  return retained.toString("utf-8");
};

export const evaluateWriting = Effect.fn("WritingEvaluation.evaluate")(
  function* (
    writingSample: string,
    submittedAt: Date,
    now: () => Date = () => new Date()
  ) {
    if (
      writingSample.trim().length === 0 ||
      !isWellFormedUtf8String(writingSample)
    ) {
      return yield* new InvalidWritingSampleError({
        reason: "Writing Sample must contain meaningful text",
      });
    }
    if (Buffer.byteLength(writingSample, "utf-8") > MAX_WRITING_SAMPLE_BYTES) {
      return yield* new InvalidWritingSampleError({
        reason: `Writing Sample exceeds ${MAX_WRITING_SAMPLE_BYTES} UTF-8 bytes`,
      });
    }

    const model = yield* EvaluationModel;
    const protectedSpans = findProtectedTechnicalContent(writingSample);
    const modelEvaluation = yield* model.evaluate(
      writingSample,
      protectedSpans
    );
    const source = Buffer.from(writingSample, "utf-8");
    const assessment = yield* Schema.decodeUnknownEffect(ModelAssessmentSchema)(
      modelEvaluation.assessment,
      { onExcessProperty: "error" }
    ).pipe(
      Effect.mapError(
        () =>
          new InvalidAssessmentError({
            reason: "Model returned an invalid structured assessment",
          })
      )
    );
    const modelAuthoredText = [
      assessment.summary,
      ...assessment.findings.flatMap((finding) => [
        finding.correction,
        finding.explanation,
      ]),
      ...assessment.suggestions.flatMap((suggestion) => [
        suggestion.explanation,
        ...(suggestion.alternative === undefined
          ? []
          : [suggestion.alternative]),
      ]),
    ];
    if (modelAuthoredText.some((value) => !isWellFormedUtf8String(value))) {
      return yield* new InvalidAssessmentError({
        reason: "Model returned ill-formed Unicode text",
      });
    }
    const allSpans = [
      ...assessment.nonEnglishSpans,
      ...assessment.findings,
      ...assessment.suggestions,
    ];

    if (allSpans.some((span) => !validateSpan(source, span))) {
      return yield* new UnsafeCorrectionError({
        reason: "Assessment span does not match Writing Sample bytes",
      });
    }

    if (
      assessment.findings.some((finding, index) =>
        assessment.findings
          .slice(index + 1)
          .some((other) => overlaps(finding, other))
      ) ||
      assessment.findings.some((finding) =>
        assessment.nonEnglishSpans.some((span) => overlaps(finding, span))
      ) ||
      assessment.findings.some((finding) =>
        protectedSpans.some((span) => overlaps(finding, span))
      ) ||
      assessment.suggestions.some(
        (suggestion) =>
          assessment.findings.some((finding) =>
            overlaps(suggestion, finding)
          ) ||
          assessment.nonEnglishSpans.some((span) =>
            overlaps(suggestion, span)
          ) ||
          protectedSpans.some((span) => overlaps(suggestion, span))
      )
    ) {
      return yield* new UnsafeCorrectionError({
        reason: "Assessment contains overlapping correction spans",
      });
    }

    if (
      assessment.findings.some(
        (finding) => finding.correction === finding.originalText
      )
    ) {
      return yield* new UnsafeCorrectionError({
        reason: "Assessment contains a no-op Correction",
      });
    }

    const evaluatedEnglishWordCount = countEnglishWords(
      textWithout(source, [...assessment.nonEnglishSpans, ...protectedSpans])
    );
    if (evaluatedEnglishWordCount === 0) {
      return yield* new NoEnglishError({
        reason: "Writing Sample contains no meaning-bearing English",
      });
    }

    const orderedFindings = assessment.findings.toSorted(
      (left, right) =>
        left.byteStart - right.byteStart || left.byteEnd - right.byteEnd
    );
    const orderedSuggestions = assessment.suggestions.toSorted(
      (left, right) =>
        left.byteStart - right.byteStart || left.byteEnd - right.byteEnd
    );
    const correctedText = yield* applyCorrections(
      writingSample,
      orderedFindings
    );
    const score = scoreEvaluation(
      evaluatedEnglishWordCount,
      orderedFindings.map((finding) => finding.severity)
    );
    const evaluationTimestamp = now().toISOString();
    const evaluation: Evaluation = {
      band: proficiencyBandForScore(score),
      correctedText,
      evaluatedAt: evaluationTimestamp,
      evaluatedEnglishWordCount,
      findings: orderedFindings,
      id: randomUUID(),
      model: modelEvaluation.model,
      originalText: writingSample,
      provider: modelEvaluation.provider,
      rubricVersion: RUBRIC_VERSION,
      score,
      suggestions: orderedSuggestions,
      summary: assessment.summary,
    };

    yield* persistEvaluation({
      contentHash: createHash("sha256").update(writingSample).digest("hex"),
      evaluation,
      inputTokens: modelEvaluation.inputTokens,
      latencyMilliseconds: modelEvaluation.latencyMilliseconds,
      outputTokens: modelEvaluation.outputTokens,
      submittedAt: submittedAt.toISOString(),
    });

    return evaluation;
  }
);
