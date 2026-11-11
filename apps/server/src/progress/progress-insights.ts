import { Effect } from "effect";

import {
  proficiencyBandForScore,
  RUBRIC_VERSION,
} from "../evaluation/rubric-v1";
import type { ErrorCategory, ProficiencyBand } from "../evaluation/rubric-v1";
import { getEvaluation, listEvaluations } from "../history/learning-history";
import type {
  Evaluation,
  EvaluationFinding,
} from "../history/learning-history";

export type ProgressPeriod = "7-days" | "30-days" | "all";

export interface CategoryRecurrence {
  readonly category: ErrorCategory;
  readonly evaluationCount: number;
  readonly recurrencePercentage: number;
}

export interface CategoryDistribution {
  readonly category: ErrorCategory;
  readonly findingCount: number;
}

export interface RecurringCorrection {
  readonly correction: string;
  readonly occurrenceCount: number;
  readonly originalText: string;
}

export interface ProgressSegment {
  readonly averageBand: ProficiencyBand | null;
  readonly averageScore: number | null;
  readonly categoryDistributions: readonly CategoryDistribution[];
  readonly categoryRecurrences: readonly CategoryRecurrence[];
  readonly evaluatedEnglishWordCount: number;
  readonly evaluationCount: number;
  readonly findingCount: number;
  readonly findingRate: number | null;
  readonly recurringCorrections: readonly RecurringCorrection[];
  readonly rubricVersion: string;
}

export interface ProgressSummary extends ProgressSegment {
  readonly incompatibleSegments: readonly ProgressSegment[];
  readonly period: ProgressPeriod;
}

export type ProgressEvidenceSelection =
  | { readonly category: ErrorCategory; readonly kind: "category" }
  | {
      readonly correction: string;
      readonly kind: "correction";
      readonly originalText: string;
    }
  | { readonly kind: "average-score" }
  | { readonly kind: "finding-rate" };

export interface ProgressEvidenceFinding {
  readonly category: ErrorCategory;
  readonly correction: string;
  readonly evaluatedAt: string;
  readonly evaluationId: string;
  readonly evaluationSummary: string;
  readonly explanation: string;
  readonly findingIndex: number;
  readonly originalText: string;
  readonly severity: EvaluationFinding["severity"];
}

export interface ProgressEvidenceEvaluation {
  readonly band: ProficiencyBand;
  readonly evaluatedAt: string;
  readonly evaluatedEnglishWordCount: number;
  readonly findingCount: number;
  readonly id: string;
  readonly score: number;
  readonly summary: string;
}

export interface ProgressEvidence {
  readonly evaluations: readonly ProgressEvidenceEvaluation[];
  readonly findings: readonly ProgressEvidenceFinding[];
  readonly period: ProgressPeriod;
  readonly rubricVersion: string;
  readonly selection: ProgressEvidenceSelection;
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const PERIOD_MILLISECONDS = {
  "30-days": 30 * DAY_MILLISECONDS,
  "7-days": 7 * DAY_MILLISECONDS,
} as const;

const roundOneDecimal = (value: number) => Math.round(value * 10) / 10;

const correctionKey = (originalText: string, correction: string) =>
  JSON.stringify([originalText, correction]);

const segment = (
  retained: readonly Evaluation[],
  rubricVersion: string
): ProgressSegment => {
  const evaluationCount = retained.length;
  const evaluatedEnglishWordCount = retained.reduce(
    (total, evaluation) => total + evaluation.evaluatedEnglishWordCount,
    0
  );
  const findingCount = retained.reduce(
    (total, evaluation) => total + evaluation.findings.length,
    0
  );
  const averageScore =
    evaluationCount === 0
      ? null
      : roundOneDecimal(
          retained.reduce((total, evaluation) => total + evaluation.score, 0) /
            evaluationCount
        );
  const recurrence = new Map<ErrorCategory, number>();
  const distribution = new Map<ErrorCategory, number>();
  const corrections = new Map<string, RecurringCorrection>();

  for (const evaluation of retained) {
    for (const category of new Set(
      evaluation.findings.map((finding) => finding.category)
    )) {
      recurrence.set(category, (recurrence.get(category) ?? 0) + 1);
    }
    for (const finding of evaluation.findings) {
      distribution.set(
        finding.category,
        (distribution.get(finding.category) ?? 0) + 1
      );
      const key = correctionKey(finding.originalText, finding.correction);
      const current = corrections.get(key);
      corrections.set(key, {
        correction: finding.correction,
        occurrenceCount: (current?.occurrenceCount ?? 0) + 1,
        originalText: finding.originalText,
      });
    }
  }

  return {
    averageBand:
      averageScore === null ? null : proficiencyBandForScore(averageScore),
    averageScore,
    categoryDistributions: [...distribution.entries()]
      .map(([category, count]) => ({ category, findingCount: count }))
      .toSorted(
        (left, right) =>
          right.findingCount - left.findingCount ||
          left.category.localeCompare(right.category)
      ),
    categoryRecurrences: [...recurrence.entries()]
      .map(([category, count]) => ({
        category,
        evaluationCount: count,
        recurrencePercentage: (count / evaluationCount) * 100,
      }))
      .toSorted(
        (left, right) =>
          right.evaluationCount - left.evaluationCount ||
          left.category.localeCompare(right.category)
      ),
    evaluatedEnglishWordCount,
    evaluationCount,
    findingCount,
    findingRate:
      evaluatedEnglishWordCount === 0
        ? null
        : (findingCount / evaluatedEnglishWordCount) * 100,
    recurringCorrections: [...corrections.values()]
      .filter((correction) => correction.occurrenceCount > 1)
      .toSorted(
        (left, right) =>
          right.occurrenceCount - left.occurrenceCount ||
          left.originalText.localeCompare(right.originalText) ||
          left.correction.localeCompare(right.correction)
      ),
    rubricVersion,
  };
};

const evaluationsInPeriod = Effect.fn("ProgressInsights.evaluationsInPeriod")(
  function* (period: ProgressPeriod, now: Date) {
    const summaries = yield* listEvaluations();
    const all: Evaluation[] = [];
    for (const summary of summaries) {
      const evaluation = yield* getEvaluation(summary.id);
      if (evaluation !== null) {
        all.push(evaluation);
      }
    }
    if (period === "all") {
      return all;
    }
    const end = now.getTime();
    const start = end - PERIOD_MILLISECONDS[period];
    return all.filter((evaluation) => {
      const time = Date.parse(evaluation.evaluatedAt);
      return time >= start && time <= end;
    });
  }
);

export const getProgressSummary = Effect.fn(
  "ProgressInsights.getProgressSummary"
)(function* (
  { period }: { readonly period: ProgressPeriod },
  now: Date = new Date()
) {
  const retained = yield* evaluationsInPeriod(period, now);
  const incompatibleVersions = [
    ...new Set(
      retained
        .map((evaluation) => evaluation.rubricVersion)
        .filter((version) => version !== RUBRIC_VERSION)
    ),
  ].toSorted((left, right) => left.localeCompare(right));

  return {
    ...segment(
      retained.filter(
        (evaluation) => evaluation.rubricVersion === RUBRIC_VERSION
      ),
      RUBRIC_VERSION
    ),
    incompatibleSegments: incompatibleVersions.map((version) =>
      segment(
        retained.filter((evaluation) => evaluation.rubricVersion === version),
        version
      )
    ),
    period,
  } satisfies ProgressSummary;
});

export const getProgressEvidence = Effect.fn(
  "ProgressInsights.getProgressEvidence"
)(function* (
  {
    period,
    selection,
  }: {
    readonly period: ProgressPeriod;
    readonly selection: ProgressEvidenceSelection;
  },
  now: Date = new Date()
) {
  const retained = (yield* evaluationsInPeriod(period, now)).filter(
    (evaluation) => evaluation.rubricVersion === RUBRIC_VERSION
  );
  const findingsFor = (evaluation: Evaluation) =>
    evaluation.findings
      .map((finding, findingIndex) => ({
        category: finding.category,
        correction: finding.correction,
        evaluatedAt: evaluation.evaluatedAt,
        evaluationId: evaluation.id,
        evaluationSummary: evaluation.summary,
        explanation: finding.explanation,
        findingIndex,
        originalText: finding.originalText,
        severity: finding.severity,
      }))
      .filter((finding) => {
        if (selection.kind === "category") {
          return finding.category === selection.category;
        }
        if (selection.kind === "correction") {
          return (
            finding.originalText === selection.originalText &&
            finding.correction === selection.correction
          );
        }
        return selection.kind === "finding-rate";
      });
  const selectedFindings = retained.flatMap(findingsFor);
  const selectedIds = new Set(
    selectedFindings.map((finding) => finding.evaluationId)
  );
  const selectedEvaluations =
    selection.kind === "average-score" || selection.kind === "finding-rate"
      ? retained
      : retained.filter((evaluation) => selectedIds.has(evaluation.id));

  return {
    evaluations: selectedEvaluations.map((evaluation) => ({
      band: evaluation.band,
      evaluatedAt: evaluation.evaluatedAt,
      evaluatedEnglishWordCount: evaluation.evaluatedEnglishWordCount,
      findingCount: evaluation.findings.length,
      id: evaluation.id,
      score: evaluation.score,
      summary: evaluation.summary,
    })),
    findings: selectedFindings,
    period,
    rubricVersion: RUBRIC_VERSION,
    selection,
  } satisfies ProgressEvidence;
});
