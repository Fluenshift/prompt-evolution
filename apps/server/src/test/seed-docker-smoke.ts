import { Database } from "@english-prompt-evaluation/db";
import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Config, Effect, Layer } from "effect";

import { EvaluationModel } from "../evaluation/evaluation-model";
import { evaluateWriting } from "../evaluation/writing-evaluation";

const writingSample = Effect.runSync(
  Config.nonEmptyString("DOCKER_SMOKE_SAMPLE").pipe(
    Config.withDefault("Command fail.")
  )
);
const findingStart = writingSample.indexOf("fail");

if (findingStart === -1) {
  throw new Error("DOCKER_SMOKE_SAMPLE must contain 'fail'");
}

const byteStart = Buffer.byteLength(
  writingSample.slice(0, findingStart),
  "utf-8"
);

const model = EvaluationModel.fake(() =>
  Effect.succeed({
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
    latencyMilliseconds: 1,
    model: "deterministic-docker-smoke-model",
    provider: "test",
  })
);
const layer = Layer.merge(
  Database.layer.pipe(Layer.provide(ServerConfig.layer)),
  model
).pipe(Layer.provideMerge(ServerConfig.layer));
const fixedTimestamp = new Date("2026-09-08T12:00:00.000Z");
const evaluation = await Effect.runPromise(
  evaluateWriting(writingSample, fixedTimestamp, () => fixedTimestamp).pipe(
    Effect.provide(layer)
  )
);

process.stdout.write(evaluation.id);
