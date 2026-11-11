import { describe, expect, test } from "vitest";

import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import type { InMemoryEvaluationScenario } from "@/features/evaluations/in-memory-evaluation-client";

describe("in-memory evaluation client", () => {
  test("applies an explicit fixture without interpreting the Writing Sample", async () => {
    const writingSample = "Keep tset exactly as submitted.";
    const scenario = {
      correctedText: { kind: "submitted-writing" },
      detail: {
        band: "Clear",
        evaluatedAt: "2026-09-01T12:00:00.000Z",
        evaluatedEnglishWordCount: 5,
        findings: [],
        model: "fixture-model",
        provider: "Fixture provider",
        rubricVersion: "1",
        score: 92,
        suggestions: [],
        summary: "Explicit frontend fixture.",
      },
      kind: "created",
    } satisfies InMemoryEvaluationScenario;
    const client = createInMemoryEvaluationClient({ attempts: [scenario] });

    const result = await client.evaluateWriting(writingSample);

    expect(result).toMatchObject({
      evaluation: {
        correctedText: writingSample,
        findings: [],
        originalText: writingSample,
        score: 92,
      },
      kind: "created",
    });
  });

  test("a no-English fixture creates no Evaluation", async () => {
    const client = createInMemoryEvaluationClient({
      attempts: [{ kind: "no-english" }],
    });

    await expect(client.evaluateWriting("npm --version")).resolves.toEqual({
      kind: "no-english",
    });
    await expect(client.getEvaluation("evaluation-001")).resolves.toBeNull();
  });
});
