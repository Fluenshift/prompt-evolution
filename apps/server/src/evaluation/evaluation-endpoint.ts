import { Effect } from "effect";

import type { EvaluationEndpointResult } from "../app";
import { evaluateWriting } from "./writing-evaluation";

export const evaluateWritingForEndpoint = Effect.fn(
  "EvaluationEndpoint.evaluateWriting"
)(function* (writingSample: string, submittedAt: Date, now?: () => Date) {
  return yield* evaluateWriting(writingSample, submittedAt, now).pipe(
    Effect.match({
      onFailure: (failure): EvaluationEndpointResult => {
        switch (failure._tag) {
          case "NoEnglishError": {
            return { kind: "no-english" };
          }
          case "InvalidWritingSampleError": {
            return {
              code: "invalid-writing-sample",
              kind: "failure",
              retryable: false,
            };
          }
          case "EvaluationModelError": {
            return {
              code:
                failure.kind === "configuration"
                  ? "configuration-missing"
                  : failure.kind,
              kind: "failure",
              retryable: failure.recoverable,
            };
          }
          case "InvalidAssessmentError":
          case "UnsafeCorrectionError": {
            return {
              code: "invalid-assessment",
              kind: "failure",
              retryable: true,
            };
          }
          case "DatabaseError": {
            return {
              code: "persistence-failure",
              kind: "failure",
              retryable: true,
            };
          }
          default: {
            const exhaustiveFailure: never = failure;
            return exhaustiveFailure;
          }
        }
      },
      onSuccess: (evaluation): EvaluationEndpointResult => ({
        evaluation,
        kind: "created",
      }),
    })
  );
});
