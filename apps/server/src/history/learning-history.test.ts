import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { Effect } from "effect";

import { makeTemporaryDatabase } from "../test/database";
import {
  deleteEvaluation,
  getEvaluation,
  listEvaluations,
  persistEvaluation,
} from "./learning-history";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

const sample = (id: string, originalText = "Command fail.") => ({
  contentHash: "same-content-hash",
  evaluation: {
    band: "Natural" as const,
    correctedText: "Command fails.",
    evaluatedAt: "2026-09-07T12:00:00.000Z",
    evaluatedEnglishWordCount: 2,
    findings: [
      {
        byteEnd: 12,
        byteStart: 8,
        category: "Verb form/tense" as const,
        correction: "fails",
        explanation: "A singular subject needs a singular verb.",
        originalText: "fail",
        severity: "Minor" as const,
      },
    ],
    id,
    model: "deterministic-test-model",
    originalText,
    provider: "test",
    rubricVersion: "1",
    score: 85,
    suggestions: [
      {
        alternative: "Run the command.",
        byteEnd: 7,
        byteStart: 0,
        explanation: "Choice depends on intended tone.",
        originalText: "Command",
      },
    ],
    summary: "One local agreement error.",
  },
  inputTokens: 10,
  latencyMilliseconds: 20,
  outputTokens: 30,
  submittedAt: "2026-09-07T11:59:59.000Z",
});

describe("Learning History", () => {
  it("retains immutable complete Evaluations newest first", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* persistEvaluation(sample("first"));
        yield* persistEvaluation(sample("second"));
        return {
          detail: yield* getEvaluation("first"),
          summaries: yield* listEvaluations(),
        };
      }).pipe(Effect.provide(database.layer))
    );

    expect(result.summaries.map(({ id }) => id)).toEqual(["second", "first"]);
    expect(result.detail).toEqual(sample("first").evaluation);
  });

  it("deletes one whole Evaluation while preserving other evidence", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* persistEvaluation(sample("keep"));
        yield* persistEvaluation(sample("delete", "Repeated sample."));
        yield* deleteEvaluation("delete");
        return {
          deleted: yield* getEvaluation("delete"),
          kept: yield* getEvaluation("keep"),
          summaries: yield* listEvaluations(),
        };
      }).pipe(Effect.provide(database.layer))
    );

    expect(result.deleted).toBeNull();
    expect(result.kept?.id).toBe("keep");
    expect(result.summaries.map(({ id }) => id)).toEqual(["keep"]);
  });

  it("reopens complete retained evidence after the database service is replaced", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);

    await Effect.runPromise(
      persistEvaluation(sample("durable")).pipe(Effect.provide(database.layer))
    );
    const reopened = await Effect.runPromise(
      getEvaluation("durable").pipe(Effect.provide(database.layer))
    );

    expect(reopened).toEqual(sample("durable").evaluation);
  });

  it("rolls back the parent row when a child insert fails", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const invalid = sample("partial");
    const [finding] = invalid.evaluation.findings;
    if (finding === undefined) {
      throw new Error("Expected fixture Finding");
    }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const outcome = yield* Effect.exit(
          persistEvaluation({
            ...invalid,
            evaluation: {
              ...invalid.evaluation,
              findings: [
                {
                  ...finding,
                  explanation: null as never,
                },
              ],
            },
          })
        );
        const retained = yield* getEvaluation("partial");
        return { outcome, retained };
      }).pipe(Effect.provide(database.layer))
    );

    expect(result.outcome._tag).toBe("Failure");
    expect(result.retained).toBeNull();
  });
});
