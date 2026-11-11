import path from "node:path";

import { Database } from "@english-prompt-evaluation/db";
import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Layer, ManagedRuntime, Option, Redacted } from "effect";

import { createApp } from "./app";
import { evaluateWritingForEndpoint } from "./evaluation/evaluation-endpoint";
import { EvaluationModel } from "./evaluation/evaluation-model";
import { OpenRouterEvaluationModelLive } from "./evaluation/openai-evaluation-model";
import { RUBRIC_VERSION } from "./evaluation/rubric-v1";
import {
  deleteEvaluation,
  getEvaluation,
  listEvaluations,
} from "./history/learning-history";
import {
  getProgressEvidence,
  getProgressSummary,
} from "./progress/progress-insights";

const AppLayer = Layer.merge(
  Database.layer.pipe(Layer.provide(ServerConfig.layer)),
  OpenRouterEvaluationModelLive
).pipe(Layer.provideMerge(ServerConfig.layer));

const runtime = ManagedRuntime.make(AppLayer);

const config = await runtime.runPromise(ServerConfig);
const evaluationModel = await runtime.runPromise(EvaluationModel);
const databaseUrl = Redacted.value(config.databaseUrl);
const databaseFile = databaseUrl.replace(/^file:/u, "");
const resolvedDatabaseFile =
  databaseFile === ":memory:" ? databaseFile : path.resolve(databaseFile);
const dataLocation = Option.getOrElse(
  config.dataDisplayPath,
  () => resolvedDatabaseFile
);

const submitEvaluation = (writingSample: string) =>
  runtime.runPromise(evaluateWritingForEndpoint(writingSample, new Date()));

const app = await createApp({
  deleteEvaluation: (evaluationId) =>
    runtime.runPromise(deleteEvaluation(evaluationId)),
  evaluateWriting: submitEvaluation,
  getEvaluation: (evaluationId) =>
    runtime.runPromise(getEvaluation(evaluationId)),
  getProgressEvidence: (options) =>
    runtime.runPromise(getProgressEvidence(options)),
  getProgressSummary: (options) =>
    runtime.runPromise(getProgressSummary(options)),
  listEvaluations: () => runtime.runPromise(listEvaluations()),
  logEvaluation: (event) => {
    console.info(JSON.stringify({ event: "writing-evaluation", ...event }));
  },
  serveWeb: config.nodeEnv === "production",
  setup: {
    configured: evaluationModel.configured,
    dataLocation,
    model: evaluationModel.model,
    provider: evaluationModel.provider,
    rubricVersion: RUBRIC_VERSION,
  },
  webDistPath: config.webDistPath,
});

app.listen({ hostname: config.host, port: config.port });

// The process signal handler is outside the runtime by definition: it is what
// disposes the runtime, so it cannot itself be an Effect.
// oxlint-disable-next-line effecttsgo/async-function
const shutdown = async () => {
  await app.stop();
  await runtime.dispose();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}
