import { rm } from "node:fs/promises";
import path from "node:path";

import { Effect, Layer, ManagedRuntime } from "effect";

import { createApp } from "../app";
import { evaluateWritingForEndpoint } from "../evaluation/evaluation-endpoint";
import { EvaluationModel } from "../evaluation/evaluation-model";
import {
  deleteEvaluation,
  getEvaluation,
  listEvaluations,
} from "../history/learning-history";
import {
  getProgressEvidence,
  getProgressSummary,
} from "../progress/progress-insights";
import { makeTemporaryDatabase } from "./database";

const database = await makeTemporaryDatabase();
const model = EvaluationModel.fake((writingSample) => {
  const characterStart = writingSample.indexOf("fail");
  const byteStart =
    characterStart === -1
      ? 0
      : Buffer.byteLength(writingSample.slice(0, characterStart), "utf-8");
  return Effect.succeed({
    assessment: {
      findings:
        characterStart === -1
          ? []
          : [
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
      summary:
        characterStart === -1
          ? "No demonstrable English errors."
          : "One local agreement error.",
    },
    latencyMilliseconds: 1,
    model: "deterministic-e2e-model",
    provider: "Deterministic test provider",
  });
});
const runtime = ManagedRuntime.make(Layer.merge(database.layer, model));
const app = createApp({
  deleteEvaluation: (id) => runtime.runPromise(deleteEvaluation(id)),
  evaluateWriting: (writingSample) =>
    runtime.runPromise(evaluateWritingForEndpoint(writingSample, new Date())),
  getEvaluation: (id) => runtime.runPromise(getEvaluation(id)),
  getProgressEvidence: (options) =>
    runtime.runPromise(getProgressEvidence(options)),
  getProgressSummary: (options) =>
    runtime.runPromise(getProgressSummary(options)),
  listEvaluations: () => runtime.runPromise(listEvaluations()),
  serveWeb: true,
  setup: {
    configured: true,
    dataLocation: database.databasePath,
    model: "deterministic-e2e-model",
    provider: "Deterministic test provider",
    rubricVersion: "1",
  },
  webDistPath: path.resolve(import.meta.dir, "../../../web/dist"),
});

app.listen({ hostname: "127.0.0.1", port: 4173 });

const shutdown = async () => {
  await app.stop();
  await runtime.dispose();
  await rm(database.directory, { force: true, recursive: true });
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}
