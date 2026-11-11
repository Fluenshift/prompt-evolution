import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { Effect } from "effect";

import {
  deleteEvaluation,
  persistEvaluation,
} from "../history/learning-history";
import type { Evaluation } from "../history/learning-history";
import { makeTemporaryDatabase } from "../test/database";
import { getProgressEvidence, getProgressSummary } from "./progress-insights";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

const evaluation = (
  id: string,
  evaluatedAt: string,
  rubricVersion = "1"
): Evaluation => ({
  band: "Clear",
  correctedText: "The command fails.",
  evaluatedAt,
  evaluatedEnglishWordCount: 100,
  findings: [
    {
      byteEnd: 11,
      byteStart: 4,
      category: "Verb form/tense",
      correction: "command",
      explanation: "The verb form needs agreement.",
      originalText: "command",
      severity: "Minor",
    },
    {
      byteEnd: 17,
      byteStart: 12,
      category: "Verb form/tense",
      correction: "fails",
      explanation: "The singular subject needs a singular verb.",
      originalText: "fails",
      severity: "Minor",
    },
  ],
  id,
  model: "test-model",
  originalText: "The command fails.",
  provider: "test",
  rubricVersion,
  score: 70,
  suggestions: [
    {
      alternative: "Run it.",
      byteEnd: 3,
      byteStart: 0,
      explanation: "Tone depends on context.",
      originalText: "The",
    },
  ],
  summary: `${id} summary`,
});

const retain = (value: Evaluation) =>
  persistEvaluation({
    contentHash: `${value.id}-hash`,
    evaluation: value,
    latencyMilliseconds: 1,
    submittedAt: value.evaluatedAt,
  });

describe("Progress Insights", () => {
  it("treats all as every retained Evaluation despite clock rollback", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("future", "2026-09-09T12:00:00.000Z"));
        return {
          all: yield* getProgressSummary({ period: "all" }, now),
          rolling: yield* getProgressSummary({ period: "30-days" }, now),
        };
      }).pipe(Effect.provide(database.layer))
    );

    expect(result.all.evaluationCount).toBe(1);
    expect(result.rolling.evaluationCount).toBe(0);
  });

  it("segments exact period evidence by Rubric Version", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("current", "2026-09-07T12:00:00.000Z"));
        yield* retain(evaluation("older", "2026-08-20T12:00:00.000Z"));
        yield* retain(
          evaluation("incompatible", "2026-09-06T12:00:00.000Z", "2")
        );
        yield* retain(evaluation("future", "2026-09-09T12:00:00.000Z"));
        return yield* getProgressSummary({ period: "7-days" }, now);
      }).pipe(Effect.provide(database.layer))
    );

    expect(summary).toMatchObject({
      evaluatedEnglishWordCount: 100,
      evaluationCount: 1,
      findingCount: 2,
      findingRate: 2,
      incompatibleSegments: [{ evaluationCount: 1, rubricVersion: "2" }],
      period: "7-days",
      rubricVersion: "1",
    });
    expect(summary.categoryRecurrences).toEqual([
      {
        category: "Verb form/tense",
        evaluationCount: 1,
        recurrencePercentage: 100,
      },
    ]);
  });

  it("traces every selected Finding while counting each Evaluation once", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const evidence = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("source", "2026-09-07T12:00:00.000Z"));
        return yield* getProgressEvidence(
          {
            period: "30-days",
            selection: { category: "Verb form/tense", kind: "category" },
          },
          now
        );
      }).pipe(Effect.provide(database.layer))
    );

    expect(evidence.evaluations.map(({ id }) => id)).toEqual(["source"]);
    expect(evidence.findings.map(({ findingIndex }) => findingIndex)).toEqual([
      0, 1,
    ]);
    expect(JSON.stringify(evidence)).not.toContain("Tone depends on context");
  });

  it("traces correction, Finding Rate, and average-score source evidence", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const evidence = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("source", "2026-09-07T12:00:00.000Z"));
        const correction = yield* getProgressEvidence(
          {
            period: "all",
            selection: {
              correction: "fails",
              kind: "correction",
              originalText: "fails",
            },
          },
          now
        );
        const findingRate = yield* getProgressEvidence(
          {
            period: "all",
            selection: { kind: "finding-rate" },
          },
          now
        );
        const averageScore = yield* getProgressEvidence(
          {
            period: "all",
            selection: { kind: "average-score" },
          },
          now
        );
        return { averageScore, correction, findingRate };
      }).pipe(Effect.provide(database.layer))
    );

    expect(evidence.correction).toMatchObject({
      evaluations: [{ id: "source" }],
      findings: [{ correction: "fails", evaluationId: "source" }],
    });
    expect(evidence.findingRate).toMatchObject({
      evaluations: [{ id: "source" }],
      findings: [{ evaluationId: "source" }, { evaluationId: "source" }],
    });
    expect(evidence.averageScore).toMatchObject({
      evaluations: [{ id: "source" }],
      findings: [],
    });
  });

  it("returns exact category recurrence ratios for the browser to format", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("with-finding", "2026-09-07T12:00:00.000Z"));
        yield* retain({
          ...evaluation("without-1", "2026-09-06T12:00:00.000Z"),
          findings: [],
        });
        yield* retain({
          ...evaluation("without-2", "2026-09-05T12:00:00.000Z"),
          findings: [],
        });
        return yield* getProgressSummary({ period: "30-days" }, now);
      }).pipe(Effect.provide(database.layer))
    );

    expect(summary.categoryRecurrences[0]?.recurrencePercentage).toBe(
      (1 / 3) * 100
    );
  });

  it("recomputes every aggregate from retained rows after deletion", async () => {
    const database = await makeTemporaryDatabase();
    directories.push(database.directory);
    const now = new Date("2026-09-08T12:00:00.000Z");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* retain(evaluation("keep", "2026-09-07T12:00:00.000Z"));
        yield* retain(evaluation("remove", "2026-09-06T12:00:00.000Z"));
        const before = yield* getProgressSummary({ period: "30-days" }, now);
        yield* deleteEvaluation("remove");
        const after = yield* getProgressSummary({ period: "30-days" }, now);
        return { after, before };
      }).pipe(Effect.provide(database.layer))
    );

    expect(result.before).toMatchObject({
      averageBand: "Clear",
      averageScore: 70,
      categoryDistributions: [{ category: "Verb form/tense", findingCount: 4 }],
      categoryRecurrences: [
        {
          category: "Verb form/tense",
          evaluationCount: 2,
          recurrencePercentage: 100,
        },
      ],
      evaluatedEnglishWordCount: 200,
      evaluationCount: 2,
      findingCount: 4,
      findingRate: 2,
      recurringCorrections: [
        {
          correction: "command",
          occurrenceCount: 2,
          originalText: "command",
        },
        {
          correction: "fails",
          occurrenceCount: 2,
          originalText: "fails",
        },
      ],
    });
    expect(result.after).toMatchObject({
      evaluatedEnglishWordCount: 100,
      evaluationCount: 1,
      findingCount: 2,
      findingRate: 2,
      recurringCorrections: [],
    });
  });
});
