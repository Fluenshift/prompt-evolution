import type {
  Evaluation,
  EvaluationClient,
  EvaluationSubmissionResult,
  ProficiencyBand,
  ProgressEvidenceEvaluation,
  ProgressEvidenceFinding,
  ProgressPeriod,
  ProgressSegment,
  SetupStatus,
} from "@/features/evaluations/evaluation-client";

type ScenarioCorrectedText =
  | { kind: "literal"; value: string }
  | { kind: "submitted-writing" };

interface CreatedEvaluationScenario {
  correctedText: ScenarioCorrectedText;
  detail: Omit<Evaluation, "correctedText" | "id" | "originalText">;
  kind: "created";
}

export type InMemoryEvaluationScenario =
  | CreatedEvaluationScenario
  | { error: Error; kind: "failure" }
  | { kind: "no-english" };

type InMemoryDeletionScenario =
  | { error: Error; kind: "failure" }
  | { kind: "deleted" };

interface InMemoryEvaluationClientOptions {
  attempts?: readonly InMemoryEvaluationScenario[];
  currentRubricVersion?: string;
  deletionAttempts?: readonly InMemoryDeletionScenario[];
  fallback?: CreatedEvaluationScenario;
  now?: () => Date;
  seededEvaluations?: readonly Evaluation[];
  setupStatus?: SetupStatus;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const PERIOD_DURATIONS: Record<Exclude<ProgressPeriod, "all">, number> = {
  "30-days": 30 * DAY_IN_MILLISECONDS,
  "7-days": 7 * DAY_IN_MILLISECONDS,
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const proficiencyBandForScore = (score: number): ProficiencyBand => {
  if (score >= 85) {
    return "Natural";
  }
  if (score >= 70) {
    return "Clear";
  }
  if (score >= 50) {
    return "Understandable";
  }
  return "Needs revision";
};

const correctionKeyFor = (originalText: string, correction: string) =>
  JSON.stringify([originalText, correction]);

const toEvidenceEvaluation = ({
  band,
  evaluatedAt,
  evaluatedEnglishWordCount,
  findings,
  id,
  score,
  summary,
}: Evaluation): ProgressEvidenceEvaluation => ({
  band,
  evaluatedAt,
  evaluatedEnglishWordCount,
  findingCount: findings.length,
  id,
  score,
  summary,
});

const evidenceFindingsOf = (
  evaluation: Evaluation
): readonly ProgressEvidenceFinding[] =>
  evaluation.findings.map((finding, findingIndex) => ({
    category: finding.category,
    correction: finding.correction,
    evaluatedAt: evaluation.evaluatedAt,
    evaluationId: evaluation.id,
    evaluationSummary: evaluation.summary,
    explanation: finding.explanation,
    findingIndex,
    originalText: finding.originalText,
    severity: finding.severity,
  }));

const summarizeSegment = (
  evaluations: readonly Evaluation[],
  rubricVersion: string
): ProgressSegment => {
  const evaluationCount = evaluations.length;
  const evaluatedEnglishWordCount = evaluations.reduce(
    (total, evaluation) => total + evaluation.evaluatedEnglishWordCount,
    0
  );
  const findingCount = evaluations.reduce(
    (total, evaluation) => total + evaluation.findings.length,
    0
  );
  const unroundedAverageScore =
    evaluationCount === 0
      ? null
      : evaluations.reduce((total, evaluation) => total + evaluation.score, 0) /
        evaluationCount;
  const averageScore =
    unroundedAverageScore === null
      ? null
      : roundToOneDecimal(unroundedAverageScore);
  const categoryEvaluationCounts = new Map<
    Evaluation["findings"][number]["category"],
    number
  >();
  const categoryFindingCounts = new Map<
    Evaluation["findings"][number]["category"],
    number
  >();
  const correctionCounts = new Map<
    string,
    { correction: string; occurrenceCount: number; originalText: string }
  >();

  for (const evaluation of evaluations) {
    const evaluationCategories = new Set(
      evaluation.findings.map((finding) => finding.category)
    );

    for (const category of evaluationCategories) {
      categoryEvaluationCounts.set(
        category,
        (categoryEvaluationCounts.get(category) ?? 0) + 1
      );
    }

    for (const finding of evaluation.findings) {
      categoryFindingCounts.set(
        finding.category,
        (categoryFindingCounts.get(finding.category) ?? 0) + 1
      );

      const correctionKey = correctionKeyFor(
        finding.originalText,
        finding.correction
      );
      const correction = correctionCounts.get(correctionKey);

      correctionCounts.set(correctionKey, {
        correction: finding.correction,
        occurrenceCount: (correction?.occurrenceCount ?? 0) + 1,
        originalText: finding.originalText,
      });
    }
  }

  return {
    averageBand:
      averageScore === null ? null : proficiencyBandForScore(averageScore),
    averageScore,
    categoryDistributions: [...categoryFindingCounts]
      .map(([category, count]) => ({ category, findingCount: count }))
      .toSorted(
        (first, second) =>
          second.findingCount - first.findingCount ||
          first.category.localeCompare(second.category)
      ),
    categoryRecurrences: [...categoryEvaluationCounts]
      .map(([category, count]) => ({
        category,
        evaluationCount: count,
        recurrencePercentage:
          evaluationCount === 0 ? 0 : (count / evaluationCount) * 100,
      }))
      .toSorted(
        (first, second) =>
          second.recurrencePercentage - first.recurrencePercentage ||
          first.category.localeCompare(second.category)
      ),
    evaluatedEnglishWordCount,
    evaluationCount,
    findingCount,
    findingRate:
      evaluatedEnglishWordCount === 0
        ? null
        : (findingCount / evaluatedEnglishWordCount) * 100,
    recurringCorrections: [...correctionCounts.values()]
      .filter((correction) => correction.occurrenceCount > 1)
      .toSorted(
        (first, second) =>
          second.occurrenceCount - first.occurrenceCount ||
          first.originalText.localeCompare(second.originalText) ||
          first.correction.localeCompare(second.correction)
      ),
    rubricVersion,
  };
};

const DEFAULT_NO_CORRECTION_SCENARIO = {
  correctedText: { kind: "submitted-writing" },
  detail: {
    band: "Natural",
    evaluatedAt: "2026-09-01T12:00:00.000Z",
    evaluatedEnglishWordCount: 9,
    findings: [],
    model: "openai/gpt-5.6-terra",
    provider: "OpenRouter",
    rubricVersion: "1",
    score: 100,
    suggestions: [],
    summary: "No errors found.",
  },
  kind: "created",
} satisfies CreatedEvaluationScenario;

export const createInMemoryEvaluationClient = ({
  attempts = [],
  currentRubricVersion = "1",
  deletionAttempts = [],
  fallback = DEFAULT_NO_CORRECTION_SCENARIO,
  now = () => new Date(),
  seededEvaluations = [],
  setupStatus = {
    configured: true,
    dataLocation: "Session memory",
    model: "deterministic-test-model",
    provider: "Deterministic test adapter",
    rubricVersion: currentRubricVersion,
  },
}: InMemoryEvaluationClientOptions = {}): EvaluationClient => {
  const evaluations = new Map(
    seededEvaluations.map((evaluation) => [evaluation.id, evaluation])
  );
  const historySequence = new Map(
    seededEvaluations.map((evaluation, index) => [evaluation.id, index])
  );
  let attemptIndex = 0;
  let deletionAttemptIndex = 0;
  let nextHistorySequence = seededEvaluations.length;
  let nextIdentity = 1;

  const nextEvaluationId = () => {
    let candidate: string;

    do {
      candidate = `evaluation-${String(nextIdentity).padStart(3, "0")}`;
      nextIdentity += 1;
    } while (evaluations.has(candidate));

    return candidate;
  };

  const evaluationsNewestFirst = () =>
    [...evaluations.values()].toSorted((first, second) => {
      const evaluatedAtDifference =
        Date.parse(second.evaluatedAt) - Date.parse(first.evaluatedAt);

      if (evaluatedAtDifference !== 0) {
        return evaluatedAtDifference;
      }

      return (
        (historySequence.get(second.id) ?? 0) -
        (historySequence.get(first.id) ?? 0)
      );
    });

  const evaluationsInPeriod = (period: ProgressPeriod) => {
    const periodEnd = now().getTime();
    const periodStart =
      period === "all"
        ? Number.NEGATIVE_INFINITY
        : periodEnd - PERIOD_DURATIONS[period];

    return evaluationsNewestFirst().filter((evaluation) => {
      const evaluatedAt = Date.parse(evaluation.evaluatedAt);

      return evaluatedAt >= periodStart && evaluatedAt <= periodEnd;
    });
  };

  const compatibleEvaluationsInPeriod = (period: ProgressPeriod) =>
    evaluationsInPeriod(period).filter(
      (evaluation) => evaluation.rubricVersion === currentRubricVersion
    );

  return {
    deleteEvaluation(evaluationId) {
      const scenario = deletionAttempts[deletionAttemptIndex] ?? {
        kind: "deleted",
      };
      deletionAttemptIndex += 1;

      if (scenario.kind === "failure") {
        return Promise.reject(scenario.error);
      }

      evaluations.delete(evaluationId);
      historySequence.delete(evaluationId);
      return Promise.resolve();
    },

    evaluateWriting(originalText) {
      const scenario = attempts[attemptIndex] ?? fallback;
      attemptIndex += 1;

      if (scenario.kind === "failure") {
        return Promise.reject(scenario.error);
      }

      if (scenario.kind === "no-english") {
        return Promise.resolve({ kind: "no-english" });
      }

      const evaluation: Evaluation = {
        ...scenario.detail,
        correctedText:
          scenario.correctedText.kind === "submitted-writing"
            ? originalText
            : scenario.correctedText.value,
        id: nextEvaluationId(),
        originalText,
      };

      evaluations.set(evaluation.id, evaluation);
      historySequence.set(evaluation.id, nextHistorySequence);
      nextHistorySequence += 1;

      const result: EvaluationSubmissionResult = {
        evaluation,
        kind: "created",
      };
      return Promise.resolve(result);
    },

    getEvaluation(evaluationId) {
      return Promise.resolve(evaluations.get(evaluationId) ?? null);
    },

    getProgressEvidence({ period, selection }) {
      const contributingEvaluations = compatibleEvaluationsInPeriod(period);
      const matchesSelection = (finding: ProgressEvidenceFinding) => {
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
      };
      const findings = contributingEvaluations.flatMap((evaluation) =>
        evidenceFindingsOf(evaluation).filter(matchesSelection)
      );
      const contributingIdentities = new Set(
        findings.map((finding) => finding.evaluationId)
      );
      const evaluationsForSelection =
        selection.kind === "average-score" || selection.kind === "finding-rate"
          ? contributingEvaluations
          : contributingEvaluations.filter((evaluation) =>
              contributingIdentities.has(evaluation.id)
            );

      return Promise.resolve({
        evaluations: evaluationsForSelection.map(toEvidenceEvaluation),
        findings,
        period,
        rubricVersion: currentRubricVersion,
        selection,
      });
    },

    getProgressSummary({ period }) {
      const evaluationsForPeriod = evaluationsInPeriod(period);
      const incompatibleRubricVersions = [
        ...new Set(
          evaluationsForPeriod
            .map((evaluation) => evaluation.rubricVersion)
            .filter((rubricVersion) => rubricVersion !== currentRubricVersion)
        ),
      ].toSorted((first, second) => first.localeCompare(second));

      return Promise.resolve({
        ...summarizeSegment(
          evaluationsForPeriod.filter(
            (evaluation) => evaluation.rubricVersion === currentRubricVersion
          ),
          currentRubricVersion
        ),
        incompatibleSegments: incompatibleRubricVersions.map((rubricVersion) =>
          summarizeSegment(
            evaluationsForPeriod.filter(
              (evaluation) => evaluation.rubricVersion === rubricVersion
            ),
            rubricVersion
          )
        ),
        period,
      });
    },

    getSetupStatus() {
      return Promise.resolve(setupStatus);
    },

    listEvaluations() {
      const summaries = evaluationsNewestFirst().map(
        ({ band, evaluatedAt, id, rubricVersion, score, summary }) => ({
          band,
          evaluatedAt,
          id,
          rubricVersion,
          score,
          summary,
        })
      );

      return Promise.resolve(summaries);
    },
  };
};
