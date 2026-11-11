import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";

import { Database } from "@english-prompt-evaluation/db";
import { Effect, Result, Schema } from "effect";

import { listEvaluations } from "../history/learning-history";
import type { Evaluation } from "../history/learning-history";
import { makeTemporaryDatabase } from "../test/database";
import type {
  AssessmentSpan,
  ModelAssessment,
  ModelEvaluation,
} from "./evaluation-model";
import { EvaluationModel, ModelAssessmentSchema } from "./evaluation-model";
import { EVALUATION_MAX_OUTPUT_TOKENS } from "./evaluation-request-policy";
import {
  LIVE_CALIBRATION_FIXTURES,
  LIVE_CALIBRATION_REQUIREMENTS,
} from "./live-calibration-fixtures";
import type {
  ExpectedLiveFinding,
  ExpectedLiveSuggestion,
  LiveCalibrationFixture,
} from "./live-calibration-fixtures";
import { makeOpenRouterEvaluationModelLayer } from "./openai-evaluation-model";
import { findProtectedTechnicalContent } from "./protected-content";
import {
  countEnglishWords,
  ERROR_CATEGORIES,
  proficiencyBandForScore,
  RUBRIC_VERSION,
  scoreEvaluation,
} from "./rubric-v1";
import { evaluateWriting } from "./writing-evaluation";

const MODEL = "openai/gpt-5.6-terra";
const PROVIDER = "OpenRouter";
const INPUT_PRICE_PER_MILLION = 2;
const OUTPUT_PRICE_PER_MILLION = 12;
const CONSERVATIVE_INPUT_TOKENS_PER_CALL = 10_000;
const BUDGET_USD = 3;

class CalibrationError extends Schema.TaggedError<CalibrationError>()(
  "CalibrationError",
  { reason: Schema.String }
) {}

const overlaps = (left: AssessmentSpan, right: AssessmentSpan) =>
  left.byteStart < right.byteEnd && right.byteStart < left.byteEnd;

const spanMatchesSource = (source: string, span: AssessmentSpan) => {
  const bytes = Buffer.from(source, "utf-8");
  return (
    Number.isInteger(span.byteStart) &&
    Number.isInteger(span.byteEnd) &&
    span.byteStart >= 0 &&
    span.byteEnd > span.byteStart &&
    span.byteEnd <= bytes.byteLength &&
    bytes.subarray(span.byteStart, span.byteEnd).toString("utf-8") ===
      span.originalText
  );
};

const expectedSpan = (source: string, originalText: string): AssessmentSpan => {
  const firstIndex = source.indexOf(originalText);
  const lastIndex = source.lastIndexOf(originalText);
  if (firstIndex === -1 || firstIndex !== lastIndex) {
    throw new Error(
      `Frozen expected span must occur exactly once: ${JSON.stringify(originalText)}`
    );
  }
  const byteStart = Buffer.byteLength(source.slice(0, firstIndex), "utf-8");
  return {
    byteEnd: byteStart + Buffer.byteLength(originalText, "utf-8"),
    byteStart,
    originalText,
  };
};

const validateExpectedFinding = (
  expected: ExpectedLiveFinding,
  actual: ModelAssessment["findings"][number],
  index: number
) => {
  const failures: string[] = [];
  const label = `finding ${index + 1}`;
  if (actual.category !== expected.category) {
    failures.push(
      `${label} category: expected ${expected.category}, got ${actual.category}`
    );
  }
  if (actual.severity !== expected.severity) {
    failures.push(
      `${label} severity: expected ${expected.severity}, got ${actual.severity}`
    );
  }
  if (
    expected.originalText !== undefined &&
    !expected.originalText.includes(actual.originalText)
  ) {
    failures.push(
      `${label} originalText: expected ${expected.originalText.map((value) => JSON.stringify(value)).join(" or ")}, got ${JSON.stringify(actual.originalText)}`
    );
  }
  if (
    expected.corrections !== undefined &&
    !expected.corrections.includes(actual.correction)
  ) {
    failures.push(
      `${label} correction: expected ${expected.corrections.map((value) => JSON.stringify(value)).join(" or ")}, got ${JSON.stringify(actual.correction)}`
    );
  }
  return failures;
};

const explanationLabelsOriginalAsNonError = (explanation: string) =>
  /(?:not (?:confirmed )?(?:wrong|incorrect)|(?:may|might|can) be (?:valid|correct)|original (?:is|remains) valid)/iu.test(
    explanation
  );

const explanationNamesMissingContext = (explanation: string) =>
  /(?:context|intent|intended|meaning|terminology|whether)/iu.test(explanation);

const validateExpectedSuggestion = (
  expected: ExpectedLiveSuggestion,
  actual: ModelAssessment["suggestions"][number],
  index: number
) => {
  const failures: string[] = [];
  const label = `suggestion ${index + 1}`;
  if (!expected.originalText.includes(actual.originalText)) {
    failures.push(
      `${label} originalText: expected ${expected.originalText.map((value) => JSON.stringify(value)).join(" or ")}, got ${JSON.stringify(actual.originalText)}`
    );
  }
  if (
    expected.alternatives !== undefined &&
    (actual.alternative === undefined ||
      !expected.alternatives.includes(actual.alternative))
  ) {
    failures.push(`${label} alternative: unexpected value`);
  }
  if (
    expected.requireNonErrorLabel &&
    !explanationLabelsOriginalAsNonError(actual.explanation)
  ) {
    failures.push(
      `${label} explanation: must say the original is not confirmed wrong`
    );
  }
  if (
    expected.requireMissingContext &&
    !explanationNamesMissingContext(actual.explanation)
  ) {
    failures.push(`${label} explanation: must identify the missing context`);
  }
  return failures;
};

const validateAssessmentSpans = (
  writingSample: string,
  assessment: ModelAssessment
) => {
  const failures: string[] = [];
  const allSpans = [
    ...assessment.findings,
    ...assessment.nonEnglishSpans,
    ...assessment.suggestions,
  ];
  for (const [index, span] of allSpans.entries()) {
    if (!spanMatchesSource(writingSample, span)) {
      const kind =
        index < assessment.findings.length
          ? `finding ${index + 1}`
          : "assessment";
      failures.push(
        `${kind} span: bytes do not reproduce originalText ${JSON.stringify(span.originalText)}`
      );
    }
  }
  return failures;
};

const validateAssessmentFindings = (
  expected: LiveCalibrationFixture["expected"],
  assessment: ModelAssessment
) => {
  const failures: string[] = [];
  if (assessment.findings.length !== expected.findings.length) {
    failures.push(
      `findings: expected ${expected.findings.length}, got ${assessment.findings.length}`
    );
  }
  for (const [index, expectedFinding] of expected.findings.entries()) {
    const actual = assessment.findings[index];
    if (actual !== undefined) {
      failures.push(...validateExpectedFinding(expectedFinding, actual, index));
    }
  }
  return failures;
};

const validateNonEnglishSpans = (
  fixture: LiveCalibrationFixture,
  assessment: ModelAssessment
) => {
  const failures: string[] = [];
  const actualNonEnglish = assessment.nonEnglishSpans.toSorted(
    (left, right) => left.byteStart - right.byteStart
  );
  const expectedNonEnglish = fixture.expected.nonEnglishSpans
    .map((text) => expectedSpan(fixture.writingSample, text))
    .toSorted((left, right) => left.byteStart - right.byteStart);
  if (actualNonEnglish.length !== expectedNonEnglish.length) {
    failures.push(
      `non-English spans: expected ${expectedNonEnglish.length}, got ${actualNonEnglish.length}`
    );
  }
  for (const [index, expectedNonEnglishSpan] of expectedNonEnglish.entries()) {
    const [actual] = actualNonEnglish.slice(index, index + 1);
    if (
      actual !== undefined &&
      (actual.byteStart !== expectedNonEnglishSpan.byteStart ||
        actual.byteEnd !== expectedNonEnglishSpan.byteEnd ||
        actual.originalText !== expectedNonEnglishSpan.originalText)
    ) {
      failures.push(
        `non-English span ${index + 1}: expected exact UTF-8 bytes`
      );
    }
  }
  return failures;
};

const validateAssessmentSuggestions = (
  expected: LiveCalibrationFixture["expected"],
  assessment: ModelAssessment
) => {
  const failures: string[] = [];
  if (expected.suggestions === "optional-context") {
    if (assessment.suggestions.length > 1) {
      failures.push(
        `suggestions: expected at most 1, got ${assessment.suggestions.length}`
      );
    }
    const [suggestion] = assessment.suggestions;
    if (suggestion !== undefined) {
      failures.push(
        ...validateExpectedSuggestion(
          {
            alternatives: ["quick"],
            originalText: ["fast"],
            requireMissingContext: true,
            requireNonErrorLabel: true,
          },
          suggestion,
          0
        )
      );
    }
    return failures;
  }

  if (assessment.suggestions.length !== expected.suggestions.length) {
    failures.push(
      `suggestions: expected ${expected.suggestions.length}, got ${assessment.suggestions.length}`
    );
  }
  for (const [index, expectedSuggestion] of expected.suggestions.entries()) {
    const actual = assessment.suggestions[index];
    if (actual !== undefined) {
      failures.push(
        ...validateExpectedSuggestion(expectedSuggestion, actual, index)
      );
    }
  }
  return failures;
};

const validateAssessmentSafety = (
  writingSample: string,
  assessment: ModelAssessment
) => {
  const failures: string[] = [];
  const protectedSpans = findProtectedTechnicalContent(writingSample);
  if (
    assessment.findings.some((finding) =>
      protectedSpans.some((span) => overlaps(finding, span))
    ) ||
    assessment.suggestions.some((suggestion) =>
      protectedSpans.some((span) => overlaps(suggestion, span))
    )
  ) {
    failures.push("feedback overlaps Protected Technical Content");
  }
  if (
    assessment.findings.some((finding, index) =>
      assessment.findings
        .slice(index + 1)
        .some((other) => overlaps(finding, other))
    )
  ) {
    failures.push("findings overlap");
  }
  if (
    assessment.findings.some((finding) =>
      assessment.nonEnglishSpans.some((span) => overlaps(finding, span))
    )
  ) {
    failures.push("a Finding overlaps non-English text");
  }
  if (
    assessment.findings.some(
      (finding) => finding.correction === finding.originalText
    )
  ) {
    failures.push("a Finding contains a no-op correction");
  }
  return failures;
};

export const validateFixtureAssessment = (
  fixture: LiveCalibrationFixture,
  assessment: ModelAssessment
): string[] => {
  const { expected, writingSample } = fixture;
  const failures = [
    ...validateAssessmentSpans(writingSample, assessment),
    ...validateAssessmentFindings(expected, assessment),
    ...validateNonEnglishSpans(fixture, assessment),
    ...validateAssessmentSuggestions(expected, assessment),
    ...validateAssessmentSafety(writingSample, assessment),
  ];
  return [...new Set(failures)];
};

interface FixtureCoverage {
  readonly categories: Set<string>;
  readonly requirements: Set<string>;
  readonly severities: Set<string>;
}

const expectedEnglishWordCount = (fixture: LiveCalibrationFixture) => {
  const excludedSpans = [
    ...fixture.expected.nonEnglishSpans.map((text) =>
      expectedSpan(fixture.writingSample, text)
    ),
    ...findProtectedTechnicalContent(fixture.writingSample),
  ];
  const retainedBytes = Buffer.from(fixture.writingSample, "utf-8");
  for (const span of excludedSpans) {
    retainedBytes.fill(0x20, span.byteStart, span.byteEnd);
  }
  return countEnglishWords(retainedBytes.toString("utf-8"));
};

const validateFixtureScore = (fixture: LiveCalibrationFixture) => {
  const failures: string[] = [];
  if (fixture.expected.outcome !== "evaluation") {
    return failures;
  }
  const derivedScore = scoreEvaluation(
    expectedEnglishWordCount(fixture),
    fixture.expected.findings.map(({ severity }) => severity)
  );
  const derivedBand = proficiencyBandForScore(derivedScore);
  if (derivedScore !== fixture.expected.score) {
    failures.push(
      `score mismatch: ${fixture.id} expected ${fixture.expected.score}, derived ${derivedScore}`
    );
  }
  if (derivedBand !== fixture.expected.band) {
    failures.push(
      `band mismatch: ${fixture.id} expected ${fixture.expected.band}, derived ${derivedBand}`
    );
  }
  return failures;
};

const validateFixtureDefinition = (
  fixture: LiveCalibrationFixture,
  ids: Set<string>
) => {
  const failures: string[] = [];
  if (ids.has(fixture.id)) {
    failures.push(`duplicate fixture id: ${fixture.id}`);
  }
  ids.add(fixture.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(fixture.id)) {
    failures.push(`unstable fixture id: ${fixture.id}`);
  }
  if (fixture.writingSample.trim().length === 0) {
    failures.push(`empty fixture: ${fixture.id}`);
  }
  if (
    fixture.consistencyRepetitions === 2 &&
    fixture.expected.findings.length !== 1
  ) {
    failures.push(
      `consistency fixture must declare exactly one Finding: ${fixture.id}`
    );
  }
  for (const text of fixture.expected.nonEnglishSpans) {
    try {
      expectedSpan(fixture.writingSample, text);
    } catch {
      failures.push(`non-English span is not unique: ${fixture.id}`);
    }
  }
  failures.push(...validateFixtureScore(fixture));
  return failures;
};

const collectCoverage = (
  fixture: LiveCalibrationFixture,
  coverage: FixtureCoverage
) => {
  for (const requirement of fixture.requirements) {
    coverage.requirements.add(requirement);
  }
  for (const finding of fixture.expected.findings) {
    coverage.categories.add(finding.category);
    coverage.severities.add(finding.severity);
  }
};

const validateCoverage = (
  fixtures: readonly LiveCalibrationFixture[],
  coverage: FixtureCoverage
) => {
  const failures: string[] = [];
  for (const category of ERROR_CATEGORIES) {
    if (!coverage.categories.has(category)) {
      failures.push(`missing category: ${category}`);
    }
    const repeated = fixtures.some(
      (fixture) =>
        fixture.consistencyRepetitions === 2 &&
        fixture.expected.findings.some(
          (finding) => finding.category === category
        )
    );
    if (!repeated) {
      failures.push(`missing repeated consistency case: ${category}`);
    }
  }
  for (const severity of ["Minor", "Moderate", "Major"] as const) {
    if (!coverage.severities.has(severity)) {
      failures.push(`missing severity: ${severity}`);
    }
  }
  for (const requirement of LIVE_CALIBRATION_REQUIREMENTS) {
    if (!coverage.requirements.has(requirement)) {
      failures.push(`missing requirement: ${requirement}`);
    }
  }
  return failures;
};

export const validateFixtureSet = (
  fixtures: readonly LiveCalibrationFixture[]
): string[] => {
  const failures: string[] = [];
  const ids = new Set<string>();
  const coverage: FixtureCoverage = {
    categories: new Set(),
    requirements: new Set(),
    severities: new Set(),
  };
  for (const fixture of fixtures) {
    failures.push(...validateFixtureDefinition(fixture, ids));
    collectCoverage(fixture, coverage);
  }
  failures.push(...validateCoverage(fixtures, coverage));
  return failures;
};

interface CalibrationResult {
  readonly assessment: ModelAssessment;
  readonly failures: readonly string[];
  readonly fixtureId: string;
  readonly inputTokens: number;
  readonly latencyMilliseconds: number;
  readonly outputTokens: number;
  readonly repetition: number;
}

const runApplicationBoundary = (
  fixture: LiveCalibrationFixture,
  modelEvaluation: ModelEvaluation
) =>
  evaluateWriting(
    fixture.writingSample,
    new Date("2026-09-15T12:00:00.000Z"),
    () => new Date("2026-09-15T12:00:00.000Z")
  ).pipe(
    Effect.provide(EvaluationModel.fake(() => Effect.succeed(modelEvaluation))),
    Effect.result
  );

const taggedErrorName = (value: unknown) =>
  typeof value === "object" && value !== null && "_tag" in value
    ? String(value._tag)
    : undefined;

const validateApplicationOutcome = (
  fixture: LiveCalibrationFixture,
  outcome: Result.Result<Evaluation, unknown>
): string[] => {
  const failures: string[] = [];
  const { expected } = fixture;
  if (expected.outcome === "no-english") {
    if (
      !Result.isFailure(outcome) ||
      taggedErrorName(outcome.failure) !== "NoEnglishError"
    ) {
      failures.push("application outcome: expected NoEnglishError");
    }
    return failures;
  }

  if (Result.isFailure(outcome)) {
    failures.push("application outcome: expected a successful Evaluation");
    return failures;
  }
  const evaluation = outcome.success;
  if (
    evaluation.evaluatedEnglishWordCount !== expectedEnglishWordCount(fixture)
  ) {
    failures.push("application English word count: unexpected value");
  }
  if (evaluation.score !== expected.score) {
    failures.push(
      `application score: expected ${expected.score}, got ${evaluation.score}`
    );
  }
  if (evaluation.band !== expected.band) {
    failures.push(
      `application band: expected ${expected.band}, got ${evaluation.band}`
    );
  }
  if (
    expected.correctedText === "changed"
      ? evaluation.correctedText === fixture.writingSample
      : evaluation.correctedText !== expected.correctedText
  ) {
    failures.push("application corrected text: unexpected bytes");
  }
  if (evaluation.model !== MODEL || evaluation.provider !== PROVIDER) {
    failures.push("application provider metadata: unexpected value");
  }
  if (evaluation.rubricVersion !== RUBRIC_VERSION) {
    failures.push("application rubric version: unexpected value");
  }
  return failures;
};

const displayText = (value: string) => value.replaceAll(/\s+/gu, " ");

const reviewLine = (result: CalibrationResult) => {
  const pairs = result.assessment.findings
    .map(
      (finding) =>
        `${finding.category}/${finding.severity} ${JSON.stringify(finding.originalText)}→${JSON.stringify(finding.correction)}: ${displayText(finding.explanation)}`
    )
    .join("; ");
  const suggestions = result.assessment.suggestions
    .map(
      (suggestion) =>
        `${JSON.stringify(suggestion.originalText)}: ${displayText(suggestion.explanation)}`
    )
    .join("; ");
  return [
    result.failures.length === 0 ? "PASS" : "FAIL",
    `${result.fixtureId}#${result.repetition}`,
    pairs.length === 0 ? "findings=0" : pairs,
    suggestions.length === 0 ? "suggestions=0" : suggestions,
    `summary=${displayText(result.assessment.summary)}`,
  ].join(" | ");
};

const callCount = LIVE_CALIBRATION_FIXTURES.reduce(
  (total, fixture) => total + (fixture.consistencyRepetitions ?? 1),
  0
);
const conservativeMaximumCost =
  (callCount *
    (CONSERVATIVE_INPUT_TOKENS_PER_CALL * INPUT_PRICE_PER_MILLION +
      EVALUATION_MAX_OUTPUT_TOKENS * OUTPUT_PRICE_PER_MILLION)) /
  1_000_000;

export const validateCalibrationBudget = (previousSpend: number): string[] => {
  if (!Number.isFinite(previousSpend) || previousSpend < 0) {
    return ["Previous calibration spend must be a finite non-negative number"];
  }
  return previousSpend + conservativeMaximumCost > BUDGET_USD
    ? ["Calibration preflight exceeds the remaining approved budget"]
    : [];
};

const printUsage = (
  inputTokens: number,
  outputTokens: number,
  previousSpend: number
) => {
  const estimatedCost =
    (inputTokens * INPUT_PRICE_PER_MILLION +
      outputTokens * OUTPUT_PRICE_PER_MILLION) /
    1_000_000;
  console.log(
    `Usage: input=${inputTokens}, output=${outputTokens}, estimated_standard_cost_usd=${estimatedCost.toFixed(6)}, cumulative_estimated_usd=${(previousSpend + estimatedCost).toFixed(6)}, conservative_preflight_usd=${conservativeMaximumCost.toFixed(6)}`
  );
};

const runLiveCalibration = async () => {
  const fixtureFailures = validateFixtureSet(LIVE_CALIBRATION_FIXTURES);
  if (fixtureFailures.length > 0) {
    throw new Error(
      `Frozen fixture validation failed: ${fixtureFailures.join("; ")}`
    );
  }
  const previousSpend = Number(Bun.env.CALIBRATION_SPENT_USD ?? "0");
  const budgetFailures = validateCalibrationBudget(previousSpend);
  if (budgetFailures.length > 0) {
    throw new Error(budgetFailures.join("; "));
  }

  const fixtureSource = Bun.file(
    new URL("live-calibration-fixtures.ts", import.meta.url)
  );
  const fixtureHash = createHash("sha256")
    .update(Buffer.from(await fixtureSource.arrayBuffer()))
    .digest("hex");
  const temporaryDatabase = await makeTemporaryDatabase();
  const results: CalibrationResult[] = [];
  let activeFixture = "configuration";
  let inputTokens = 0;
  let outputTokens = 0;

  console.log(
    `Frozen fixture sha256=${fixtureHash}; calls=${callCount}; model=${MODEL}; rubric=${RUBRIC_VERSION}; retries=0; previous_spend_usd=${previousSpend.toFixed(6)}`
  );

  try {
    const program = Effect.gen(function* () {
      const model = yield* EvaluationModel;
      yield* Database;
      if (!model.configured) {
        return yield* new CalibrationError({
          reason: "OPENROUTER_API_KEY is not configured",
        });
      }
      if (model.model !== MODEL || model.provider !== PROVIDER) {
        return yield* new CalibrationError({
          reason: "The configured provider/model does not match the frozen run",
        });
      }

      let successfulEvaluations = 0;
      for (const fixture of LIVE_CALIBRATION_FIXTURES) {
        const repetitions = fixture.consistencyRepetitions ?? 1;
        for (let repetition = 1; repetition <= repetitions; repetition += 1) {
          activeFixture = `${fixture.id}#${repetition}`;
          const modelEvaluation = yield* model.evaluate(
            fixture.writingSample,
            findProtectedTechnicalContent(fixture.writingSample)
          );
          inputTokens += modelEvaluation.inputTokens ?? 0;
          outputTokens += modelEvaluation.outputTokens ?? 0;
          const assessment = yield* Schema.decodeUnknownEffect(
            ModelAssessmentSchema
          )(modelEvaluation.assessment, { onExcessProperty: "error" }).pipe(
            Effect.mapError(
              () =>
                new CalibrationError({
                  reason: "Model assessment failed calibration decoding",
                })
            )
          );
          const failures = validateFixtureAssessment(fixture, assessment);
          const applicationOutcome = yield* runApplicationBoundary(
            fixture,
            modelEvaluation
          );
          failures.push(
            ...validateApplicationOutcome(fixture, applicationOutcome)
          );
          if (Result.isSuccess(applicationOutcome)) {
            successfulEvaluations += 1;
          }
          const result: CalibrationResult = {
            assessment,
            failures,
            fixtureId: fixture.id,
            inputTokens: modelEvaluation.inputTokens ?? 0,
            latencyMilliseconds: modelEvaluation.latencyMilliseconds,
            outputTokens: modelEvaluation.outputTokens ?? 0,
            repetition,
          };
          results.push(result);
          yield* Effect.sync(() => {
            console.log(reviewLine(result));
            for (const failure of result.failures) {
              console.log(`  - ${failure}`);
            }
          });
        }
      }

      const retained = yield* listEvaluations();
      if (retained.length !== successfulEvaluations) {
        return yield* new CalibrationError({
          reason: "Temporary History count does not match successful fixtures",
        });
      }
      return results;
    }).pipe(Effect.provide(makeOpenRouterEvaluationModelLayer(undefined, 0)));

    // Supply the database separately so the live model layer remains unchanged.
    await Effect.runPromise(
      program.pipe(Effect.provide(temporaryDatabase.layer))
    );
    const failed = results.filter((result) => result.failures.length > 0);
    printUsage(inputTokens, outputTokens, previousSpend);
    console.log(
      `Automated result: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length} calls passed); semantic review is required separately.`
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } catch {
    console.error(
      `Automated result: ABORT at ${activeFixture}; completed=${results.length}/${callCount}; no credential or raw provider body was logged.`
    );
    printUsage(inputTokens, outputTokens, previousSpend);
    process.exitCode = 1;
  } finally {
    await rm(temporaryDatabase.directory, { force: true, recursive: true });
  }
};

if (import.meta.main) {
  try {
    await runLiveCalibration();
  } catch {
    console.error(
      "Calibration aborted safely; no credential or raw provider body was logged."
    );
    process.exitCode = 1;
  }
}
