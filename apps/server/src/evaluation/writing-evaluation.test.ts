import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Database } from "@english-prompt-evaluation/db";
import { evaluations } from "@english-prompt-evaluation/db/schema";
import { ServerConfig } from "@english-prompt-evaluation/env/server";
import { Effect, Layer, Option, Redacted } from "effect";

import { getEvaluation, listEvaluations } from "../history/learning-history";
import { getProgressSummary } from "../progress/progress-insights";
import { evaluateWritingForEndpoint } from "./evaluation-endpoint";
import { EvaluationModel, EvaluationModelError } from "./evaluation-model";
import { evaluateWriting } from "./writing-evaluation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

const testLayer = async (
  modelLayer: ReturnType<typeof EvaluationModel.fake>
) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "prompt-evolution-evaluation-")
  );
  temporaryDirectories.push(directory);
  const configLayer = Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      dataDisplayPath: Option.none(),
      databaseUrl: Redacted.make(`file:${path.join(directory, "test.db")}`),
      host: "127.0.0.1",
      migrationsPath: path.resolve(
        import.meta.dir,
        "../../../../packages/db/src/migrations"
      ),
      nodeEnv: "test",
      port: 3000,
      webDistPath: "../web/dist",
    })
  );

  return Layer.merge(
    Database.layer.pipe(Layer.provide(configLayer)),
    modelLayer
  );
};

const assessmentLayer = (assessment: unknown) =>
  testLayer(
    EvaluationModel.fake(() =>
      Effect.succeed({
        assessment,
        latencyMilliseconds: 1,
        model: "deterministic-test-model",
        provider: "test",
      })
    )
  );
const emptyAssessment = {
  findings: [],
  nonEnglishSpans: [],
  suggestions: [],
  summary: "No demonstrable English errors.",
};
const evaluateSample = async (
  sample: string,
  assessment: unknown = emptyAssessment
) =>
  Effect.runPromise(
    evaluateWriting(sample, new Date("2026-09-07T12:00:00Z")).pipe(
      Effect.provide(await assessmentLayer(assessment))
    )
  );

describe("Writing Evaluation", () => {
  it("rejects oversized input before calling the external model", async () => {
    let callCount = 0;
    const layer = await testLayer(
      EvaluationModel.fake(() => {
        callCount += 1;
        return Effect.succeed({
          assessment: emptyAssessment,
          latencyMilliseconds: 1,
          model: "deterministic-test-model",
          provider: "test",
        });
      })
    );
    const failure = await Effect.runPromise(
      evaluateWriting("a".repeat(32 * 1024 + 1), new Date()).pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    );

    expect(failure).toMatchObject({ _tag: "InvalidWritingSampleError" });
    expect(callCount).toBe(0);
  });

  it("rejects samples without meaning-bearing English and stores nothing", async () => {
    const sample = "Olá mundo.\n`const value = true`";
    const nonEnglishText = "Olá mundo.";
    const layer = await assessmentLayer({
      findings: [],
      nonEnglishSpans: [
        {
          byteEnd: Buffer.byteLength(nonEnglishText, "utf-8"),
          byteStart: 0,
          originalText: nonEnglishText,
        },
      ],
      suggestions: [],
      summary: "No English passage to evaluate.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(sample, new Date()).pipe(
          Effect.flip
        );
        const retained = yield* listEvaluations();
        return { failure, retained };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "NoEnglishError" });
    expect(result.retained).toEqual([]);
  });

  it("preserves and excludes model-identified non-English UTF-8 spans", async () => {
    const english = "Please fix teh text.";
    const nonEnglish = "Não altere isto.";
    const sample = `${english}\n${nonEnglish}`;
    const errorStart = Buffer.byteLength("Please fix ", "utf-8");
    const nonEnglishStart = Buffer.byteLength(`${english}\n`, "utf-8");
    const layer = await assessmentLayer({
      findings: [
        {
          byteEnd: errorStart + 3,
          byteStart: errorStart,
          category: "Spelling",
          correction: "the",
          explanation: "The word is misspelled.",
          originalText: "teh",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [
        {
          byteEnd: nonEnglishStart + Buffer.byteLength(nonEnglish, "utf-8"),
          byteStart: nonEnglishStart,
          originalText: nonEnglish,
        },
      ],
      suggestions: [],
      summary: "One spelling error in the English passage.",
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluation = yield* evaluateWriting(
          sample,
          new Date("2026-09-07T12:00:00.000Z"),
          () => new Date("2026-09-07T12:00:00.000Z")
        );
        const progress = yield* getProgressSummary(
          { period: "all" },
          new Date("2026-09-08T12:00:00.000Z")
        );
        return { evaluation, progress };
      }).pipe(Effect.provide(layer))
    );

    expect(result.evaluation.correctedText).toBe(
      `Please fix the text.\n${nonEnglish}`
    );
    expect(result.evaluation.evaluatedEnglishWordCount).toBe(4);
    expect(result.evaluation.findings).toHaveLength(1);
    expect(result.progress).toMatchObject({
      evaluatedEnglishWordCount: 4,
      evaluationCount: 1,
      findingCount: 1,
      findingRate: 25,
    });
  });

  it("returns a complete no-correction Evaluation for correct English", async () => {
    const sample = "Review this function and explain why the test fails.";
    const result = await evaluateSample(sample);

    expect(result).toMatchObject({
      band: "Natural",
      correctedText: sample,
      evaluatedEnglishWordCount: 9,
      findings: [],
      score: 100,
      summary: "No demonstrable English errors.",
    });
  });

  it("keeps context-dependent Suggestions score-neutral", async () => {
    const sample = "Use fast mode.";
    const start = Buffer.byteLength("Use ", "utf-8");
    const result = await evaluateSample(sample, {
      findings: [],
      nonEnglishSpans: [],
      suggestions: [
        {
          alternative: "quick",
          byteEnd: start + 4,
          byteStart: start,
          explanation:
            "The original is not confirmed wrong; intended terminology determines the choice.",
          originalText: "fast",
        },
      ],
      summary: "No demonstrable English errors.",
    });

    expect(result).toMatchObject({
      band: "Natural",
      correctedText: sample,
      score: 100,
    });
    expect(result.suggestions).toHaveLength(1);
  });

  it("evaluates prose inside quotation marks and Markdown blockquotes", async () => {
    const sample = 'She wrote, "Command fail."\n> Another command fail.';
    const firstStart = Buffer.byteLength('She wrote, "Command ', "utf-8");
    const secondStart = Buffer.byteLength(
      'She wrote, "Command fail."\n> Another command ',
      "utf-8"
    );
    const findings = [firstStart, secondStart].map((byteStart) => ({
      byteEnd: byteStart + 4,
      byteStart,
      category: "Verb form/tense" as const,
      correction: "fails",
      explanation: "A singular subject needs a singular verb.",
      originalText: "fail",
      severity: "Minor" as const,
    }));

    const result = await evaluateSample(sample, {
      findings,
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Two local agreement errors.",
    });

    expect(result.correctedText).toBe(
      'She wrote, "Command fails."\n> Another command fails.'
    );
  });

  it("keeps quoted Protected Technical Content excluded while evaluating quoted prose", async () => {
    const sample = 'She wrote, "Run `file_are_missing`; command fail."';
    const byteStart = Buffer.byteLength(
      'She wrote, "Run `file_are_missing`; command ',
      "utf-8"
    );
    const result = await evaluateSample(sample, {
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
    });

    expect(result.correctedText).toBe(
      'She wrote, "Run `file_are_missing`; command fails."'
    );
    expect(result.evaluatedEnglishWordCount).toBe(5);
  });

  it("excludes structured data, commands, paths, identifiers, and logs", async () => {
    const sample = [
      "Check this.",
      '{"user_id":"bad value"}',
      "$ bun test src/app.test.ts",
      "Open /var/log/app.log.",
      "Open src/app.test.ts now.",
      "Open my-file.ts, a.js, and .env now.",
      "TypeError: command fail",
      "Call getEvaluation() now.",
      "Use PromptEvolution and config.value now.",
    ].join("\n");
    const result = await evaluateSample(sample);

    expect(result.evaluatedEnglishWordCount).toBe(13);
    expect(result.correctedText).toBe(sample);
  });

  it("protects multiline structured data, bare commands, Windows paths, and timestamped logs", async () => {
    const sample = [
      "Review this.",
      "{",
      '  "message": "do not count these words",',
      '  "snippet": "`still protected prose`",',
      '  "user_id": "private_value"',
      "}",
      "bun test src/app.test.ts",
      "kubectl get pods",
      "~~~txt",
      "technical words stay protected",
      "~~~",
      "Open C:\\tmp\\bad_file.txt.",
      "[WARN] technical words stay protected",
      "2026-09-08T12:00:00Z ERROR command failed badly",
      "Continue please.",
    ].join("\n");
    const result = await evaluateSample(sample);

    expect(result.evaluatedEnglishWordCount).toBe(5);
    expect(result.correctedText).toBe(sample);
  });

  it("keeps command-like imperative words in ordinary prose evaluable", async () => {
    const sample = "Go home now.\nMake this clearer.\nFind the spelling error.";
    const result = await evaluateSample(sample);

    expect(result.evaluatedEnglishWordCount).toBe(10);
    expect(result.correctedText).toBe(sample);
  });

  it("keeps errors beside ambiguous technical-looking prose evaluable", async () => {
    const sample = [
      "This works.It fails.",
      "input/output values is wrong.",
      "Visit https://example.com,, please.",
    ].join("\n");
    const punctuationStart = sample.indexOf(".It");
    const verbStart = sample.indexOf(" is wrong");
    const commaStart = sample.indexOf(",,") + 1;
    const result = await evaluateSample(sample, {
      findings: [
        {
          byteEnd: punctuationStart + 1,
          byteStart: punctuationStart,
          category: "Punctuation/capitalization",
          correction: ". ",
          explanation: "A space is needed after the sentence-ending period.",
          originalText: ".",
          severity: "Minor",
        },
        {
          byteEnd: verbStart + 3,
          byteStart: verbStart + 1,
          category: "Verb form/tense",
          correction: "are",
          explanation: "The plural subject needs the plural verb form.",
          originalText: "is",
          severity: "Minor",
        },
        {
          byteEnd: commaStart + 1,
          byteStart: commaStart,
          category: "Punctuation/capitalization",
          correction: "",
          explanation: "Only one comma is needed here.",
          originalText: ",",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Three local errors.",
    });

    expect(result.correctedText).toBe(
      [
        "This works. It fails.",
        "input/output values are wrong.",
        "Visit https://example.com, please.",
      ].join("\n")
    );
  });

  it("rejects a provider Finding that edits Protected Technical Content", async () => {
    const sample = "Explain `file_are_missing` here.";
    const characterStart = sample.indexOf("file_are_missing");
    const byteStart = Buffer.byteLength(
      sample.slice(0, characterStart),
      "utf-8"
    );
    const layer = await assessmentLayer({
      findings: [
        {
          byteEnd: byteStart + Buffer.byteLength("file_are_missing", "utf-8"),
          byteStart,
          category: "Grammar/syntax",
          correction: "files_are_missing",
          explanation: "The provider tried to edit an identifier.",
          originalText: "file_are_missing",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Unsafe technical edit.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const endpointResult = yield* evaluateWritingForEndpoint(
          sample,
          new Date()
        );
        const progress = yield* getProgressSummary({ period: "all" });
        return {
          endpointResult,
          progress,
          retained: yield* listEvaluations(),
        };
      }).pipe(Effect.provide(layer))
    );

    expect(result.endpointResult).toEqual({
      code: "invalid-assessment",
      kind: "failure",
      retryable: true,
    });
    expect(result.retained).toEqual([]);
    expect(result.progress.evaluationCount).toBe(0);
  });

  it("rejects a provider Finding inside a nested YAML sequence", async () => {
    const yaml = [
      "services:",
      "  app:",
      "    ports:",
      '      - "3000:3000"',
    ].join("\n");
    const sample = `Review this configuration.\n${yaml}\nContinue please.`;
    const originalText = "3000:3000";
    const characterStart = sample.indexOf(originalText);
    const byteStart = Buffer.byteLength(
      sample.slice(0, characterStart),
      "utf-8"
    );
    const layer = await assessmentLayer({
      findings: [
        {
          byteEnd: byteStart + Buffer.byteLength(originalText, "utf-8"),
          byteStart,
          category: "Punctuation/capitalization",
          correction: "3000-3000",
          explanation: "The provider tried to edit a YAML scalar.",
          originalText,
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Unsafe structured-data edit.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(sample, new Date()).pipe(
          Effect.flip
        );
        return { failure, retained: yield* listEvaluations() };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
    expect(result.retained).toEqual([]);
  });

  it("rejects provider Findings inside scalar YAML forms", async () => {
    const cases = [
      ["Review this.", "---", "- bad grammar", "- exact data", "Continue."],
      ["Review this.", "items:", "- bad grammar", "Continue."],
      ["Review this.", "config: [bad grammar]", "Continue."],
      ["Review this.", "message: |", "  bad grammar", "Continue."],
      ["Review this.", "{message: bad grammar}", "Continue."],
      ["Review this.", "[bad grammar, exact data]", "Continue."],
      ["Review this.", "---", "{message: bad grammar}", "Continue."],
      ["Review this.", "---", "[bad grammar, exact data]", "Continue."],
    ].map((lines) => lines.join("\n"));
    const results = await Promise.all(
      cases.map(async (sample) => {
        const originalText = "bad grammar";
        const characterStart = sample.indexOf(originalText);
        const byteStart = Buffer.byteLength(
          sample.slice(0, characterStart),
          "utf-8"
        );
        const layer = await assessmentLayer({
          findings: [
            {
              byteEnd: byteStart + Buffer.byteLength(originalText, "utf-8"),
              byteStart,
              category: "Grammar/syntax",
              correction: "exact data",
              explanation: "The provider tried to edit structured data.",
              originalText,
              severity: "Minor",
            },
          ],
          nonEnglishSpans: [],
          suggestions: [],
          summary: "Unsafe structured-data edit.",
        });
        return Effect.runPromise(
          Effect.gen(function* () {
            const failure = yield* evaluateWriting(sample, new Date()).pipe(
              Effect.flip
            );
            return { failure, retained: yield* listEvaluations() };
          }).pipe(Effect.provide(layer))
        );
      })
    );

    for (const result of results) {
      expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
      expect(result.retained).toEqual([]);
    }
  });

  it("rejects a Finding whose Correction is identical to its source", async () => {
    const sample = "Command fail.";
    const layer = await assessmentLayer({
      findings: [
        {
          byteEnd: 12,
          byteStart: 8,
          category: "Verb form/tense",
          correction: "fail",
          explanation: "Malformed no-op correction.",
          originalText: "fail",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Malformed no-op correction.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(sample, new Date()).pipe(
          Effect.flip
        );
        return { failure, retained: yield* listEvaluations() };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
    expect(result.retained).toEqual([]);
  });

  it("rejects Suggestions that overlap Findings or excluded content", async () => {
    const sample = "Use `fast_mode` when wording fail.";
    const findingStart = Buffer.byteLength(
      "Use `fast_mode` when wording ",
      "utf-8"
    );
    const layer = await assessmentLayer({
      findings: [
        {
          byteEnd: findingStart + 4,
          byteStart: findingStart,
          category: "Verb form/tense",
          correction: "fails",
          explanation: "The singular subject needs agreement.",
          originalText: "fail",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [
        {
          byteEnd: findingStart + 4,
          byteStart: findingStart,
          explanation: "The provider returned contradictory feedback.",
          originalText: "fail",
        },
      ],
      summary: "Contradictory assessment.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(sample, new Date()).pipe(
          Effect.flip
        );
        return { failure, retained: yield* listEvaluations() };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
    expect(result.retained).toEqual([]);
  });

  it("rejects Suggestions on protected and non-English spans", async () => {
    const protectedSample = "Use fast_mode now.";
    const protectedStart = Buffer.byteLength("Use ", "utf-8");
    const nonEnglishSample = "Keep 你好 unchanged.";
    const nonEnglishStart = Buffer.byteLength("Keep ", "utf-8");
    const nonEnglishEnd = nonEnglishStart + Buffer.byteLength("你好", "utf-8");
    const cases = [
      {
        assessment: {
          findings: [],
          nonEnglishSpans: [],
          suggestions: [
            {
              byteEnd: protectedStart + Buffer.byteLength("fast_mode"),
              byteStart: protectedStart,
              explanation: "Protected identifiers cannot receive feedback.",
              originalText: "fast_mode",
            },
          ],
          summary: "Unsafe protected suggestion.",
        },
        sample: protectedSample,
      },
      {
        assessment: {
          findings: [],
          nonEnglishSpans: [
            {
              byteEnd: nonEnglishEnd,
              byteStart: nonEnglishStart,
              originalText: "你好",
            },
          ],
          suggestions: [
            {
              byteEnd: nonEnglishEnd,
              byteStart: nonEnglishStart,
              explanation: "Non-English text cannot receive feedback.",
              originalText: "你好",
            },
          ],
          summary: "Unsafe non-English suggestion.",
        },
        sample: nonEnglishSample,
      },
    ];

    const results = await Promise.all(
      cases.map(async (testCase) => {
        const layer = await assessmentLayer(testCase.assessment);
        return Effect.runPromise(
          Effect.gen(function* () {
            const failure = yield* evaluateWriting(
              testCase.sample,
              new Date()
            ).pipe(Effect.flip);
            return { failure, retained: yield* listEvaluations() };
          }).pipe(Effect.provide(layer))
        );
      })
    );

    for (const result of results) {
      expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
      expect(result.retained).toEqual([]);
    }
  });

  it("rejects provider spans that split a UTF-8 code point", async () => {
    const sample = "é is valid English.";
    const layer = await assessmentLayer({
      findings: [],
      nonEnglishSpans: [],
      suggestions: [
        {
          byteEnd: 1,
          byteStart: 0,
          explanation: "Malformed provider byte range.",
          originalText: "�",
        },
      ],
      summary: "Malformed offsets.",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(sample, new Date()).pipe(
          Effect.flip
        );
        return { failure, retained: yield* listEvaluations() };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "UnsafeCorrectionError" });
    expect(result.retained).toEqual([]);
  });

  it("excludes fenced and inline code while preserving their exact bytes", async () => {
    const sample =
      "Explain `file_are_missing` here.\r\n```ts\r\nconst command = 'fail twice';\r\n```\r\nPlease help.";
    const result = await evaluateSample(sample);
    expect({
      corrected: result.correctedText,
      words: result.evaluatedEnglishWordCount,
    }).toEqual({ corrected: sample, words: 4 });
  });

  it("rejects malformed model assessments without History or Progress evidence", async () => {
    const layer = await testLayer(
      EvaluationModel.fake(() =>
        Effect.succeed({
          // This is intentionally untrusted external provider output.
          assessment: {
            findings: [],
            nonEnglishSpans: [],
            suggestions: [],
            summary: 42,
          },
          latencyMilliseconds: 1,
          model: "deterministic-test-model",
          provider: "test",
        })
      )
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const endpointResult = yield* evaluateWritingForEndpoint(
          "Command fails.",
          new Date("2026-09-07T12:00:00Z")
        );
        const retained = yield* listEvaluations();
        const progress = yield* getProgressSummary({ period: "all" });
        return { endpointResult, progress, retained };
      }).pipe(Effect.provide(layer))
    );
    expect(result.endpointResult).toEqual({
      code: "invalid-assessment",
      kind: "failure",
      retryable: true,
    });
    expect(result.retained).toEqual([]);
    expect(result.progress).toMatchObject({
      evaluatedEnglishWordCount: 0,
      evaluationCount: 0,
      findingCount: 0,
    });
  });

  it("rejects ill-formed Unicode in model-authored text without storage", async () => {
    const layer = await assessmentLayer({
      findings: [],
      nonEnglishSpans: [],
      suggestions: [],
      summary: "Malformed \uD800 output",
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* evaluateWriting(
          "Clear English writing.",
          new Date("2026-09-07T12:00:00Z")
        ).pipe(Effect.flip);
        return { failure, retained: yield* listEvaluations() };
      }).pipe(Effect.provide(layer))
    );

    expect(result.failure).toMatchObject({ _tag: "InvalidAssessmentError" });
    expect(result.retained).toEqual([]);
  });

  it("derives and atomically stores one complete Evaluation", async () => {
    const layer = await testLayer(
      EvaluationModel.fake(() =>
        Effect.succeed({
          assessment: {
            findings: [
              {
                byteEnd: 12,
                byteStart: 8,
                category: "Verb form/tense",
                correction: "fails",
                explanation: "Third-person subject needs agreement.",
                originalText: "fail",
                severity: "Minor",
              },
            ],
            nonEnglishSpans: [],
            suggestions: [
              {
                alternative: "Run the command.",
                byteEnd: 7,
                byteStart: 0,
                explanation: "Imperative wording depends on intended tone.",
                originalText: "Command",
              },
            ],
            summary: "One local agreement error.",
          },
          inputTokens: 20,
          latencyMilliseconds: 25,
          model: "deterministic-test-model",
          outputTokens: 30,
          provider: "test",
        })
      )
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluation = yield* evaluateWriting(
          "Command fail.",
          new Date("2026-09-07T12:00:00.000Z")
        );
        const stored = yield* getEvaluation(evaluation.id);
        return { evaluation, stored };
      }).pipe(Effect.provide(layer))
    );

    expect(result.evaluation.correctedText).toBe("Command fails.");
    expect(result.evaluation.score).toBe(85);
    expect(result.evaluation.band).toBe("Natural");
    expect(result.stored).toEqual(result.evaluation);
  });

  it("persists no credential, hidden reasoning, or raw provider body", async () => {
    const forbidden = [
      "private-api-key-sentinel",
      "private-hidden-reasoning-sentinel",
      "private-provider-body-sentinel",
    ];
    const modelResult = {
      apiKey: forbidden[0],
      assessment: emptyAssessment,
      hiddenReasoning: forbidden[1],
      latencyMilliseconds: 1,
      model: "deterministic-test-model",
      provider: "test",
      rawProviderBody: forbidden[2],
    };
    const layer = await testLayer(
      EvaluationModel.fake(() => Effect.succeed(modelResult))
    );

    const storedProductData = await Effect.runPromise(
      Effect.gen(function* () {
        yield* evaluateWriting(
          "Clear English writing.",
          new Date("2026-09-07T12:00:00.000Z")
        );
        const database = yield* Database;
        return yield* database.run((client) => ({
          evaluations: client.$client.query("select * from evaluations").all(),
          findings: client.$client.query("select * from findings").all(),
          suggestions: client.$client.query("select * from suggestions").all(),
        }));
      }).pipe(Effect.provide(layer))
    );

    const serialized = JSON.stringify(storedProductData);
    for (const sentinel of forbidden) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("normalizes retained Findings and Suggestions into source order", async () => {
    const sample = "Teh command fail maybe.";
    const result = await evaluateSample(sample, {
      findings: [
        {
          byteEnd: 16,
          byteStart: 12,
          category: "Verb form/tense",
          correction: "fails",
          explanation: "The singular subject needs agreement.",
          originalText: "fail",
          severity: "Minor",
        },
        {
          byteEnd: 3,
          byteStart: 0,
          category: "Spelling",
          correction: "The",
          explanation: "The word is misspelled.",
          originalText: "Teh",
          severity: "Minor",
        },
      ],
      nonEnglishSpans: [],
      suggestions: [
        {
          byteEnd: 22,
          byteStart: 17,
          explanation:
            "The original is not confirmed wrong; context determines the alternative.",
          originalText: "maybe",
        },
        {
          byteEnd: 11,
          byteStart: 4,
          explanation:
            "The original is not confirmed wrong; terminology depends on context.",
          originalText: "command",
        },
      ],
      summary: "Two demonstrable errors.",
    });

    expect(result.findings.map(({ originalText }) => originalText)).toEqual([
      "Teh",
      "fail",
    ]);
    expect(result.suggestions.map(({ originalText }) => originalText)).toEqual([
      "command",
      "maybe",
    ]);
  });

  it("retains distinct submission and evaluation completion timestamps", async () => {
    const submittedAt = new Date("2026-09-07T12:00:00.000Z");
    const evaluatedAt = new Date("2026-09-07T12:00:05.000Z");
    const layer = await assessmentLayer(emptyAssessment);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluation = yield* evaluateWriting(
          "Clear English writing.",
          submittedAt,
          () => evaluatedAt
        );
        const database = yield* Database;
        const stored = yield* database.run((client) =>
          client
            .select({
              evaluatedAt: evaluations.evaluatedAt,
              submittedAt: evaluations.submittedAt,
            })
            .from(evaluations)
            .get()
        );
        return { evaluation, stored };
      }).pipe(Effect.provide(layer))
    );

    expect(result.evaluation.evaluatedAt).toBe(evaluatedAt.toISOString());
    expect(result.stored).toEqual({
      evaluatedAt: evaluatedAt.toISOString(),
      submittedAt: submittedAt.toISOString(),
    });
  });

  it("maps provider failures and stores no History or Progress evidence", async () => {
    const cases = [
      {
        code: "provider-unavailable" as const,
        kind: "provider-unavailable" as const,
        reason: "Provider timed out",
        recoverable: true,
      },
      {
        code: "provider-rejected" as const,
        kind: "provider-rejected" as const,
        reason: "Provider rejected the request",
        recoverable: true,
      },
      {
        code: "provider-timeout" as const,
        kind: "provider-timeout" as const,
        reason: "Provider timed out",
        recoverable: true,
      },
      {
        code: "provider-rate-limited" as const,
        kind: "provider-rate-limited" as const,
        reason: "Provider rate limited the request",
        recoverable: true,
      },
      {
        code: "provider-output-incomplete" as const,
        kind: "provider-output-incomplete" as const,
        reason: "Provider did not finish the response",
        recoverable: true,
      },
      {
        code: "provider-credits-exhausted" as const,
        kind: "provider-credits-exhausted" as const,
        reason: "Provider credits are exhausted",
        recoverable: false,
      },
    ];

    const results = await Promise.all(
      cases.map(async (testCase) => {
        const layer = await testLayer(
          EvaluationModel.fake(() =>
            Effect.fail(
              new EvaluationModelError({
                kind: testCase.kind,
                reason: testCase.reason,
                recoverable: testCase.recoverable,
              })
            )
          )
        );
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const endpointResult = yield* evaluateWritingForEndpoint(
              "Command fails.",
              new Date("2026-09-07T12:00:00Z")
            );
            return {
              endpointResult,
              progress: yield* getProgressSummary({ period: "all" }),
              retained: yield* listEvaluations(),
            };
          }).pipe(Effect.provide(layer))
        );
        return { ...result, testCase };
      })
    );

    for (const { endpointResult, progress, retained, testCase } of results) {
      expect(endpointResult).toEqual({
        code: testCase.code,
        kind: "failure",
        retryable: testCase.recoverable,
      });
      expect(retained).toEqual([]);
      expect(progress.evaluationCount).toBe(0);
    }
  });

  it("gives identical bytes distinct identities and the same retained hash", async () => {
    const layer = await assessmentLayer(emptyAssessment);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* evaluateWriting(
          "  Exact   writing.\n",
          new Date("2026-09-07T12:00:00.000Z")
        );
        const second = yield* evaluateWriting(
          "  Exact   writing.\n",
          new Date("2026-09-07T12:01:00.000Z")
        );
        const database = yield* Database;
        const hashes = yield* database.run((client) =>
          client
            .select({
              contentHash: evaluations.contentHash,
              id: evaluations.id,
            })
            .from(evaluations)
            .all()
        );
        return { first, hashes, second };
      }).pipe(Effect.provide(layer))
    );

    expect(result.first.id).not.toBe(result.second.id);
    expect(result.first.originalText).toBe("  Exact   writing.\n");
    expect(
      new Set(result.hashes.map(({ contentHash }) => contentHash)).size
    ).toBe(1);
  });
});
