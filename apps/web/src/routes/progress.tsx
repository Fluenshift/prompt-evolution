import { buttonVariants } from "@english-prompt-evaluation/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@english-prompt-evaluation/ui/components/empty";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";

import type {
  ErrorCategory,
  ProgressEvidence,
  ProgressEvidenceSelection,
  ProgressPeriod,
  ProgressSegment,
} from "@/features/evaluations/evaluation-client";
import { ERROR_CATEGORIES } from "@/features/evaluations/evaluation-client";

const routeApi = getRouteApi("/progress");

const PERIOD_LABELS: Record<ProgressPeriod, string> = {
  "7-days": "Last 7 days",
  "30-days": "Last 30 days",
  all: "All history",
};

const PERIODS = ["7-days", "30-days", "all"] as const;

const INSIGHTS = [
  "average-score",
  "category",
  "correction",
  "finding-rate",
] as const;

type ProgressInsight = (typeof INSIGHTS)[number];

const DEFAULT_PERIOD: ProgressPeriod = "30-days";

const numberFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

const formatMetric = (value: number) =>
  value > 0 && value < 0.1 ? "<0.1" : numberFormatter.format(value);

const formatEvaluationDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

const countLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const isProgressPeriod = (value: unknown): value is ProgressPeriod =>
  PERIODS.some((period) => period === value);

const isProgressInsight = (value: unknown): value is ProgressInsight =>
  INSIGHTS.some((insight) => insight === value);

const isErrorCategory = (value: unknown): value is ErrorCategory =>
  ERROR_CATEGORIES.some((category) => category === value);

const optionalText = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

interface ProgressSearch {
  category?: ErrorCategory;
  correction?: string;
  insight?: ProgressInsight;
  originalText?: string;
  period?: ProgressPeriod;
}

const selectionFor = (
  search: ProgressSearch
): ProgressEvidenceSelection | undefined => {
  if (search.insight === "category") {
    return search.category === undefined
      ? undefined
      : { category: search.category, kind: "category" };
  }

  if (search.insight === "correction") {
    return search.correction === undefined || search.originalText === undefined
      ? undefined
      : {
          correction: search.correction,
          kind: "correction",
          originalText: search.originalText,
        };
  }

  if (search.insight === undefined) {
    return;
  }

  return { kind: search.insight };
};

const selectionLabel = (selection: ProgressEvidenceSelection) => {
  switch (selection.kind) {
    case "average-score": {
      return "Average score";
    }
    case "category": {
      return selection.category;
    }
    case "correction": {
      return `${selection.originalText} → ${selection.correction}`;
    }
    default: {
      return "Finding rate";
    }
  }
};

const evaluationCountLabel = (segment: ProgressSegment) =>
  countLabel(segment.evaluationCount, "evaluation", "evaluations");

const SegmentCounts = ({ segment }: { segment: ProgressSegment }) => (
  <ul className="text-muted-foreground space-y-1 text-sm">
    <li>{evaluationCountLabel(segment)}</li>
    <li>
      {countLabel(
        segment.evaluatedEnglishWordCount,
        "English word",
        "English words"
      )}
    </li>
    <li>{countLabel(segment.findingCount, "finding", "findings")}</li>
  </ul>
);

const PeriodRail = ({
  period,
  progressSummary,
}: {
  period: ProgressPeriod;
  progressSummary: ProgressSegment;
}) => (
  <aside
    aria-labelledby="progress-period-heading"
    className="bg-muted/30 border-t p-4 lg:col-start-1 lg:row-start-1 lg:border-t-0 lg:border-r"
  >
    <h2
      className="text-xs font-semibold tracking-wider uppercase"
      id="progress-period-heading"
    >
      Period
    </h2>
    <nav
      aria-label="Progress period"
      className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1"
    >
      {PERIODS.map((candidate) => (
        <Link
          aria-current={candidate === period ? "page" : undefined}
          className={buttonVariants({
            className: "min-h-11 w-full justify-start rounded-lg",
            size: "sm",
            variant: candidate === period ? "default" : "outline",
          })}
          key={candidate}
          search={{ period: candidate }}
          to="/progress"
        >
          {PERIOD_LABELS[candidate]}
        </Link>
      ))}
    </nav>
    <section
      aria-label="Period summary"
      className="text-muted-foreground mt-5 border-t pt-4 text-xs leading-5"
    >
      <p>Rubric v{progressSummary.rubricVersion}</p>
      <p>{PERIOD_LABELS[period]}</p>
      <p>{evaluationCountLabel(progressSummary)}</p>
    </section>
  </aside>
);

const insightLinkClassName =
  "focus-visible:ring-ring hover:bg-muted/60 flex min-h-11 items-center justify-between gap-4 rounded-lg px-3 py-2 outline-none focus-visible:ring-2";

const LabeledBar = ({
  label,
  maximum,
  value,
}: {
  label: string;
  maximum: number;
  value: number;
}) => {
  const width = maximum === 0 ? 0 : Math.min(100, (value / maximum) * 100);

  return (
    <figure
      aria-label={label}
      className="bg-muted h-2 overflow-hidden rounded-full"
    >
      <div
        aria-hidden="true"
        className="bg-foreground/70 h-full rounded-full"
        style={{ width: `${width}%` }}
      />
    </figure>
  );
};

const EvidencePanel = ({ evidence }: { evidence: ProgressEvidence | null }) => (
  <section
    aria-label={evidence === null ? "Progress evidence" : "Evidence"}
    className="lg:sticky lg:top-6"
  >
    <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
      Progress evidence
    </p>
    {evidence === null ? (
      <div className="mt-3 space-y-3">
        <h2 className="text-base font-semibold">Select evidence</h2>
        <p className="text-muted-foreground text-sm leading-6">
          Select a metric or category to see its evaluations.
        </p>
      </div>
    ) : (
      <div className="mt-3">
        <h2 aria-live="polite" className="text-base font-semibold break-words">
          {selectionLabel(evidence.selection)}
        </h2>
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          From evaluations in the selected period.
        </p>

        {evidence.selection.kind === "average-score" ? null : (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold">Findings</h3>
            <ol aria-label="Findings" className="space-y-3">
              {evidence.findings.map((finding) => (
                <li
                  className="bg-muted/30 border-foreground/60 space-y-2 rounded-xl border-l-4 p-3"
                  key={`${finding.evaluationId}-${finding.findingIndex}`}
                >
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {finding.category} · {finding.severity}
                  </p>
                  <p className="text-sm font-medium break-words">
                    {finding.originalText} → {finding.correction}
                  </p>
                  <p className="text-muted-foreground text-xs leading-5 wrap-anywhere">
                    {finding.explanation}
                  </p>
                  <p className="text-muted-foreground text-xs leading-5">
                    {finding.evaluationSummary} ·{" "}
                    <time dateTime={finding.evaluatedAt}>
                      {formatEvaluationDate(finding.evaluatedAt)}
                    </time>
                  </p>
                  <Link
                    className={buttonVariants({
                      className: "rounded-lg",
                      size: "sm",
                      variant: "outline",
                    })}
                    params={{ evaluationId: finding.evaluationId }}
                    to="/evaluations/$evaluationId"
                  >
                    Open evaluation
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-6 space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">Evaluations</h3>
          <ol aria-label="Evaluations" className="divide-y">
            {evidence.evaluations.map((evaluation) => (
              <li
                className="space-y-2 py-3 first:pt-0 last:pb-0"
                key={evaluation.id}
              >
                <p className="text-sm font-medium break-words">
                  {evaluation.summary}
                </p>
                <p className="text-muted-foreground text-xs leading-5">
                  <time dateTime={evaluation.evaluatedAt}>
                    {formatEvaluationDate(evaluation.evaluatedAt)}
                  </time>{" "}
                  ·{" "}
                  {countLabel(
                    evaluation.evaluatedEnglishWordCount,
                    "English word",
                    "English words"
                  )}{" "}
                  · {countLabel(evaluation.findingCount, "finding", "findings")}
                </p>
                <p className="text-sm font-semibold">
                  {evaluation.score} · {evaluation.band}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )}
  </section>
);

const ProgressPage = () => {
  const { evidence, progressSummary } = routeApi.useLoaderData();
  const { period = DEFAULT_PERIOD } = routeApi.useSearch();
  const hasEvidence = progressSummary.evaluationCount > 0;
  const hasIncompatibleEvidence =
    progressSummary.incompatibleSegments.length > 0;
  const largestDistributionCount = Math.max(
    0,
    ...progressSummary.categoryDistributions.map(
      ({ findingCount }) => findingCount
    )
  );

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Progress
          </h1>
        </div>
        <p className="text-muted-foreground max-w-md text-sm sm:text-right">
          See which writing errors recur.
        </p>
      </header>

      <div className="grid overflow-hidden rounded-2xl border lg:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          {hasEvidence ? (
            <>
              <section
                aria-labelledby="current-insights-heading"
                className="p-4 sm:p-6"
              >
                <div className="mb-4">
                  <h2
                    className="text-base font-semibold"
                    id="current-insights-heading"
                  >
                    Progress
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <section
                    aria-labelledby="finding-rate-heading"
                    className="bg-muted/20 rounded-xl border p-4"
                  >
                    <h3
                      className="mt-2 text-sm font-semibold"
                      id="finding-rate-heading"
                    >
                      Finding rate
                    </h3>
                    {progressSummary.findingRate === null ? null : (
                      <p className="mt-3 text-2xl font-semibold tracking-tight">
                        {formatMetric(progressSummary.findingRate)} per 100
                        words
                      </p>
                    )}
                    <div className="mt-4">
                      <SegmentCounts segment={progressSummary} />
                    </div>
                    <Link
                      className={buttonVariants({
                        className: "mt-4 rounded-lg",
                        size: "sm",
                        variant: "outline",
                      })}
                      search={{ insight: "finding-rate", period }}
                      to="/progress"
                    >
                      See findings
                    </Link>
                  </section>

                  <section
                    aria-labelledby="average-score-heading"
                    className="bg-muted/20 rounded-xl border p-4"
                  >
                    <h3
                      className="mt-2 text-sm font-semibold"
                      id="average-score-heading"
                    >
                      Average score
                    </h3>
                    {progressSummary.averageScore === null ||
                    progressSummary.averageBand === null ? null : (
                      <p className="mt-3 text-2xl font-semibold tracking-tight">
                        {numberFormatter.format(progressSummary.averageScore)} ·{" "}
                        {progressSummary.averageBand}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-4 text-sm leading-6">
                      Scores can change when the model or rubric changes.
                    </p>
                    <Link
                      className={buttonVariants({
                        className: "mt-4 rounded-lg",
                        size: "sm",
                        variant: "outline",
                      })}
                      search={{ insight: "average-score", period }}
                      to="/progress"
                    >
                      See evaluations
                    </Link>
                  </section>
                </div>
              </section>

              <div className="grid border-t xl:grid-cols-2 xl:divide-x">
                <section
                  aria-labelledby="category-recurrence-heading"
                  className="p-4 sm:p-6"
                >
                  <h2
                    className="text-sm font-semibold"
                    id="category-recurrence-heading"
                  >
                    Recurring categories
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    Share of evaluations with each category.
                  </p>
                  <ul
                    aria-label="Recurring categories graph"
                    className="mt-4 divide-y"
                  >
                    {progressSummary.categoryRecurrences.map(
                      ({ category, evaluationCount, recurrencePercentage }) => (
                        <li className="py-1" key={category}>
                          <Link
                            className={insightLinkClassName}
                            search={{ category, insight: "category", period }}
                            to="/progress"
                          >
                            <span className="font-medium">{category}</span>
                            <span className="text-muted-foreground text-xs">
                              {formatMetric(recurrencePercentage)}% ·{" "}
                              {countLabel(
                                evaluationCount,
                                "evaluation",
                                "evaluations"
                              )}
                            </span>
                          </Link>
                          <div className="px-3 pb-3">
                            <LabeledBar
                              label={`${category}: ${formatMetric(recurrencePercentage)}% recurrence`}
                              maximum={100}
                              value={recurrencePercentage}
                            />
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                </section>

                <section
                  aria-labelledby="category-distribution-heading"
                  className="border-t p-4 sm:p-6 xl:border-t-0"
                >
                  <h2
                    className="text-sm font-semibold"
                    id="category-distribution-heading"
                  >
                    Findings by category
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    Each finding counted once.
                  </p>
                  <ul
                    aria-label="Finding distribution graph"
                    className="mt-4 divide-y"
                  >
                    {progressSummary.categoryDistributions.map(
                      ({ category, findingCount }) => (
                        <li className="py-1" key={category}>
                          <Link
                            className={insightLinkClassName}
                            search={{ category, insight: "category", period }}
                            to="/progress"
                          >
                            <span className="font-medium">{category}</span>
                            <span className="text-muted-foreground text-xs">
                              {countLabel(findingCount, "finding", "findings")}
                            </span>
                          </Link>
                          <div className="px-3 pb-3">
                            <LabeledBar
                              label={`${category}: ${countLabel(findingCount, "finding", "findings")}`}
                              maximum={largestDistributionCount}
                              value={findingCount}
                            />
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                </section>
              </div>

              {progressSummary.recurringCorrections.length > 0 ? (
                <section
                  aria-labelledby="recurring-corrections-heading"
                  className="border-t p-4 sm:p-6"
                >
                  <h2
                    className="text-sm font-semibold"
                    id="recurring-corrections-heading"
                  >
                    Recurring corrections
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    Corrections that appear more than once.
                  </p>
                  <ul className="mt-4 divide-y">
                    {progressSummary.recurringCorrections.map(
                      ({ correction, occurrenceCount, originalText }) => (
                        <li key={`${originalText}-${correction}`}>
                          <Link
                            className={insightLinkClassName}
                            search={{
                              correction,
                              insight: "correction",
                              originalText,
                              period,
                            }}
                            to="/progress"
                          >
                            <span className="min-w-0 font-medium wrap-anywhere">
                              {originalText} → {correction}
                            </span>
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {countLabel(
                                occurrenceCount,
                                "occurrence",
                                "occurrences"
                              )}
                            </span>
                          </Link>
                        </li>
                      )
                    )}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <Empty className="min-h-[28rem] border-0">
              <EmptyHeader>
                <EmptyTitle>No evaluations in this period.</EmptyTitle>
                <EmptyDescription>
                  Evaluate a writing sample to start tracking progress.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  className={buttonVariants({
                    className: "rounded-lg",
                    size: "lg",
                  })}
                  to="/"
                >
                  Evaluate a writing sample
                </Link>
              </EmptyContent>
            </Empty>
          )}

          {hasIncompatibleEvidence ? (
            <section
              aria-labelledby="other-rubrics-heading"
              className="border-t p-4 sm:p-6"
            >
              <h2 className="text-sm font-semibold" id="other-rubrics-heading">
                Other rubric versions
              </h2>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                These evaluations use another rubric, so they are shown
                separately.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {progressSummary.incompatibleSegments.map((segment) => (
                  <div
                    className="bg-muted/20 space-y-3 rounded-xl border p-4"
                    key={segment.rubricVersion}
                  >
                    <h3 className="text-sm font-medium">
                      Rubric v{segment.rubricVersion}
                    </h3>
                    <SegmentCounts segment={segment} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside
          aria-label="Progress evidence"
          className="border-t p-4 lg:col-start-3 lg:row-start-1 lg:border-t-0 lg:border-l"
        >
          <EvidencePanel evidence={evidence} />
        </aside>

        <PeriodRail period={period} progressSummary={progressSummary} />
      </div>
    </main>
  );
};

export const Route = createFileRoute("/progress")({
  component: ProgressPage,
  loader: async ({ context, deps }) => {
    const period = deps.period ?? DEFAULT_PERIOD;
    const selection = selectionFor(deps);
    const [progressSummary, evidence] = await Promise.all([
      context.evaluationClient.getProgressSummary({ period }),
      selection === undefined
        ? null
        : context.evaluationClient.getProgressEvidence({ period, selection }),
    ]);

    return { evidence, progressSummary };
  },
  loaderDeps: ({ search }: { search: ProgressSearch }) => search,
  preloadStaleTime: 0,
  validateSearch: (search: Record<string, unknown>): ProgressSearch => ({
    category: isErrorCategory(search.category) ? search.category : undefined,
    correction: optionalText(search.correction),
    insight: isProgressInsight(search.insight) ? search.insight : undefined,
    originalText: optionalText(search.originalText),
    period: isProgressPeriod(search.period) ? search.period : undefined,
  }),
});
