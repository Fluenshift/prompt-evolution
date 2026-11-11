import { describe, expect, it } from "bun:test";

import { Effect, Exit, Schema } from "effect";

import { ModelAssessmentSchema } from "./evaluation-model";
import { ERROR_CATEGORIES } from "./rubric-v1";

const assessment = (category: string, severity: string) => ({
  findings: [
    {
      byteEnd: 1,
      byteStart: 0,
      category,
      correction: "a",
      explanation: "A plain-language explanation.",
      originalText: "x",
      severity,
    },
  ],
  nonEnglishSpans: [],
  suggestions: [],
  summary: "One demonstrable error.",
});

describe("Evaluation Model contract", () => {
  it("accepts every fixed Rubric Version 1 category and severity", async () => {
    await Promise.all(
      ERROR_CATEGORIES.flatMap((category) =>
        (["Minor", "Moderate", "Major"] as const).map(async (severity) => {
          const decoded = await Effect.runPromise(
            Schema.decodeUnknownEffect(ModelAssessmentSchema)(
              assessment(category, severity),
              { onExcessProperty: "error" }
            )
          );
          expect(decoded.findings[0]).toMatchObject({ category, severity });
        })
      )
    );
  });

  it("rejects invented categories, severities, and excess provider fields", async () => {
    const candidates = [
      assessment("Prompt quality", "Minor"),
      assessment("Spelling", "Catastrophic"),
      { ...assessment("Spelling", "Minor"), hiddenReasoning: "private" },
    ];

    await Promise.all(
      candidates.map(async (candidate) => {
        const outcome = await Effect.runPromiseExit(
          Schema.decodeUnknownEffect(ModelAssessmentSchema)(candidate, {
            onExcessProperty: "error",
          })
        );
        expect(Exit.isFailure(outcome)).toBe(true);
      })
    );
  });

  it("rejects whitespace-only summaries and explanations", async () => {
    const valid = assessment("Spelling", "Minor");
    const candidates = [
      { ...valid, summary: " \n\t " },
      {
        ...valid,
        findings: [{ ...valid.findings[0], explanation: "   " }],
      },
      {
        ...valid,
        suggestions: [
          {
            byteEnd: 1,
            byteStart: 0,
            explanation: "\t",
            originalText: "x",
          },
        ],
      },
    ];

    await Promise.all(
      candidates.map(async (candidate) => {
        const outcome = await Effect.runPromiseExit(
          Schema.decodeUnknownEffect(ModelAssessmentSchema)(candidate, {
            onExcessProperty: "error",
          })
        );
        expect(Exit.isFailure(outcome)).toBe(true);
      })
    );
  });
});
