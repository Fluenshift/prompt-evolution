import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { Effect, Layer, ManagedRuntime } from "effect";

import { createApp } from "./app";
import { evaluateWritingForEndpoint } from "./evaluation/evaluation-endpoint";
import { EvaluationModel } from "./evaluation/evaluation-model";
import {
  deleteEvaluation,
  getEvaluation,
  listEvaluations,
} from "./history/learning-history";
import {
  getProgressEvidence,
  getProgressSummary,
} from "./progress/progress-insights";
import { makeTemporaryDatabase } from "./test/database";

const NOW = new Date("2026-09-08T12:00:00.000Z");

describe("integrated same-origin backend", () => {
  it("creates, reopens, aggregates, traces, and deletes durable evidence", async () => {
    const database = await makeTemporaryDatabase();
    const model = EvaluationModel.fake((writingSample) => {
      const byteStart = Buffer.byteLength(
        writingSample.slice(0, writingSample.indexOf("fail")),
        "utf-8"
      );
      return Effect.succeed({
        assessment: {
          findings: [
            {
              byteEnd: byteStart + 4,
              byteStart,
              category: "Verb form/tense",
              correction: "fails",
              explanation: "A singular subject needs a singular verb.",
              originalText: "fail",
              severity: "Minor",
            },
          ],
          nonEnglishSpans: [],
          suggestions: [],
          summary: "One local agreement error.",
        },
        inputTokens: 10,
        latencyMilliseconds: 5,
        model: "deterministic-test-model",
        outputTokens: 20,
        provider: "test",
      });
    });
    const runtime = ManagedRuntime.make(Layer.merge(database.layer, model));
    const app = createApp({
      deleteEvaluation: (id) => runtime.runPromise(deleteEvaluation(id)),
      evaluateWriting: (writingSample) =>
        runtime.runPromise(
          evaluateWritingForEndpoint(writingSample, NOW, () => NOW)
        ),
      getEvaluation: (id) => runtime.runPromise(getEvaluation(id)),
      getProgressEvidence: (options) =>
        runtime.runPromise(getProgressEvidence(options, NOW)),
      getProgressSummary: (options) =>
        runtime.runPromise(getProgressSummary(options, NOW)),
      listEvaluations: () => runtime.runPromise(listEvaluations()),
      serveWeb: false,
      setup: {
        configured: true,
        dataLocation: database.databasePath,
        model: "deterministic-test-model",
        provider: "test",
        rubricVersion: "1",
      },
      webDistPath: "unused",
    });

    try {
      const exactSample = "  Command fail.\n";
      const historyResponse = await app.handle(
        new Request("http://localhost/api/evaluations")
      );
      expect(await historyResponse.json()).toEqual([]);

      const createdResponse = await app.handle(
        new Request("http://localhost/api/evaluations", {
          body: JSON.stringify({ writingSample: exactSample }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      );
      expect(createdResponse.status).toBe(201);
      const created = (await createdResponse.json()) as {
        evaluation: { id: string };
      };
      const evaluationId = created.evaluation.id;

      const detailResponse = await app.handle(
        new Request(
          `http://localhost/api/evaluations/${encodeURIComponent(evaluationId)}`
        )
      );
      const detail = await detailResponse.json();
      expect(detail).toMatchObject({
        correctedText: "  Command fails.\n",
        evaluatedEnglishWordCount: 2,
        findings: [{ category: "Verb form/tense", severity: "Minor" }],
        id: evaluationId,
        originalText: exactSample,
        score: 85,
      });

      const progressResponse = await app.handle(
        new Request("http://localhost/api/progress?period=all")
      );
      const progress = await progressResponse.json();
      expect(progress).toMatchObject({
        evaluatedEnglishWordCount: 2,
        evaluationCount: 1,
        findingCount: 1,
        findingRate: 50,
      });

      const evidenceSearch = new URLSearchParams({
        category: "Verb form/tense",
        insight: "category",
        period: "all",
      });
      const evidenceResponse = await app.handle(
        new Request(
          `http://localhost/api/progress/evidence?${evidenceSearch.toString()}`
        )
      );
      const evidence = await evidenceResponse.json();
      expect(evidence).toMatchObject({
        evaluations: [{ id: evaluationId }],
        findings: [{ evaluationId, findingIndex: 0 }],
      });

      const deletion = await app.handle(
        new Request(`http://localhost/api/evaluations/${evaluationId}`, {
          method: "DELETE",
        })
      );
      expect(deletion.status).toBe(204);
      const afterDeletionResponse = await app.handle(
        new Request("http://localhost/api/progress?period=all")
      );
      const afterDeletion = (await afterDeletionResponse.json()) as {
        evaluationCount: number;
      };
      expect(afterDeletion.evaluationCount).toBe(0);
    } finally {
      await runtime.dispose();
      await rm(database.directory, { force: true, recursive: true });
    }
  });
});
