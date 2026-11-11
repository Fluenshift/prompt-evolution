import { Button } from "@english-prompt-evaluation/ui/components/button";
import { Label } from "@english-prompt-evaluation/ui/components/label";
import { Textarea } from "@english-prompt-evaluation/ui/components/textarea";
import { cn } from "@english-prompt-evaluation/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Command, ShieldCheck, Sparkles } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  Evaluation,
  EvaluationClient,
  EvaluationSummary,
  ProgressSummary,
  SetupStatus,
} from "@/features/evaluations/evaluation-client";
import { EvaluationRequestError } from "@/features/evaluations/http-evaluation-client";
import {
  SpellChecker,
  type TextMark,
} from "@/features/evaluations/spell-checker";

interface WritingDeskProps {
  evaluationClient: EvaluationClient;
  onEvaluationCreated: () => void;
  progressSummary: ProgressSummary;
  recentEvaluations: readonly EvaluationSummary[];
  setupStatus: SetupStatus;
}

type SubmissionStatus =
  | "failure"
  | "idle"
  | "no-english"
  | "pending"
  | "success";

type LensView = "corrected" | "findings" | "suggestions";

const LENS_VIEW_LABELS = {
  corrected: "Corrected",
  findings: "Findings",
  suggestions: "Suggestions",
} as const;

const metricFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

const formatMetric = (value: number) =>
  value > 0 && value < 0.1 ? "<0.1" : metricFormatter.format(value);

const formatEvaluationDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
};

const evaluationFailureMessages = new Map([
  [
    "provider-timeout",
    "The provider took too long. Wait a moment, then retry.",
  ],
  [
    "provider-unavailable",
    "The provider is temporarily unavailable. Wait a moment, then retry.",
  ],
  [
    "forbidden",
    "The server blocked this request. Reopen the app using its local address.",
  ],
  [
    "configuration-missing",
    "Provider setup is incomplete. Open setup to continue.",
  ],
  [
    "provider-rate-limited",
    "The provider is rate-limiting requests. Wait a moment, then retry.",
  ],
  [
    "provider-credits-exhausted",
    "OpenRouter credits or key budget exhausted. Check balance and key limit.",
  ],
  [
    "provider-rejected",
    "The provider rejected this request. Check server logs before retrying.",
  ],
  [
    "invalid-assessment",
    "The provider returned an invalid evaluation. Retry once; if it repeats, check server logs.",
  ],
  [
    "persistence-failure",
    "The evaluation could not be saved. Check server storage before retrying.",
  ],
  [
    "provider-output-incomplete",
    "The provider stopped before finishing. Retry once; if it repeats, use a shorter sample.",
  ],
]);

const describeEvaluationFailure = (error: unknown) => {
  if (error instanceof TypeError) {
    return "Could not reach the server. Check the connection and retry.";
  }

  if (error instanceof EvaluationRequestError) {
    return (
      evaluationFailureMessages.get(error.code) ??
      "Check the connection and retry."
    );
  }

  return "Check the connection and retry.";
};

const EvidenceFindings = ({
  activeFindingId,
  evaluation,
  onSelectFinding,
}: {
  activeFindingId?: string | null;
  evaluation: Evaluation;
  onSelectFinding?: (id: string) => void;
}) => {
  if (evaluation.findings.length === 0) {
    return <p className="mt-4 text-sm font-medium">No errors found.</p>;
  }

  return (
    <ol className="mt-4 space-y-3">
      {evaluation.findings.map((finding, index) => {
        const markId = `finding-${index}`;
        const isActive = activeFindingId === markId;

        return (
          <li
            className={cn(
              "bg-muted/30 border-foreground rounded-xl border-l-4 p-3 transition-all cursor-pointer hover:bg-muted/50",
              isActive &&
                "ring-2 ring-destructive border-destructive bg-destructive/5 shadow-xs"
            )}
            key={`${finding.category}-${finding.originalText}-${index}`}
            onClick={() => onSelectFinding?.(markId)}
          >
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {finding.category} · {finding.severity}
              </p>
              <span className="text-[10px] text-muted-foreground hover:text-foreground">
                Jump to text →
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold break-words">
              {finding.originalText} → {finding.correction}
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-5 wrap-anywhere">
              {finding.explanation}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

const EvidenceSuggestions = ({
  activeFindingId,
  evaluation,
  onSelectFinding,
}: {
  activeFindingId?: string | null;
  evaluation: Evaluation;
  onSelectFinding?: (id: string) => void;
}) => {
  if (evaluation.suggestions.length === 0) {
    return (
      <p className="text-muted-foreground mt-4 text-sm">
        No suggestions for this sample.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-muted-foreground text-xs leading-5">
        Suggestions are optional.
      </p>
      <ul className="space-y-3">
        {evaluation.suggestions.map((suggestion, index) => {
          const markId = `suggestion-${index}`;
          const isActive = activeFindingId === markId;

          return (
            <li
              className={cn(
                "bg-muted/30 rounded-xl border p-3 transition-all cursor-pointer hover:bg-muted/50",
                isActive &&
                  "ring-2 ring-amber-500 border-amber-500 bg-amber-500/10 shadow-xs"
              )}
              key={`${suggestion.originalText}-${index}`}
              onClick={() => onSelectFinding?.(markId)}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold break-words">
                  {suggestion.originalText}
                  {suggestion.alternative
                    ? ` → ${suggestion.alternative}`
                    : null}
                </p>
                <span className="text-[10px] text-muted-foreground hover:text-foreground">
                  Jump to text →
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-5 wrap-anywhere">
                {suggestion.explanation}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const RecentEvaluations = ({
  evaluations,
  progressSummary,
}: {
  evaluations: readonly EvaluationSummary[];
  progressSummary: ProgressSummary;
}) => (
  <aside
    aria-labelledby="recent-evaluations-heading"
    className="bg-muted/30 order-3 border-t p-4 lg:col-start-1 lg:row-start-1 lg:border-t-0 lg:border-r"
  >
    <div className="flex items-center justify-between gap-3">
      <h2
        className="text-xs font-semibold tracking-wide uppercase"
        id="recent-evaluations-heading"
      >
        Recent evaluations
      </h2>
      <Link
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-xs font-medium outline-none focus-visible:ring-2"
        to="/evaluations"
      >
        See all
      </Link>
    </div>

    {evaluations.length > 0 ? (
      <ol className="mt-3 grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {evaluations.map((evaluation) => (
          <li key={evaluation.id}>
            <Link
              className="hover:bg-background focus-visible:ring-ring block rounded-lg p-2 outline-none focus-visible:ring-2"
              params={{ evaluationId: evaluation.id }}
              to="/evaluations/$evaluationId"
            >
              <time
                className="text-muted-foreground text-xs"
                dateTime={evaluation.evaluatedAt}
              >
                {formatEvaluationDate(evaluation.evaluatedAt)}
              </time>
              <p className="mt-1 line-clamp-2 text-xs leading-5 font-medium break-words">
                {evaluation.summary}
              </p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {evaluation.score} · {evaluation.band}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-muted-foreground mt-4 text-xs leading-5">
        No evaluations yet.
      </p>
    )}

    {progressSummary.evaluationCount > 0 ? (
      <div className="mt-5 border-t pt-4">
        <p className="text-muted-foreground text-xs">Last 30 days</p>
        <p className="mt-1 text-xs font-medium">Finding rate</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {progressSummary.findingRate === null
            ? "No compatible evidence"
            : `${formatMetric(progressSummary.findingRate)} / 100 words`}
        </p>
        <Link
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 inline-flex rounded-sm text-xs font-medium outline-none focus-visible:ring-2"
          search={{ insight: "finding-rate", period: "30-days" }}
          to="/progress"
        >
          See progress
        </Link>
      </div>
    ) : null}
  </aside>
);

const EvidenceLensContent = ({
  activeFindingId,
  evaluation,
  lensView,
  onLensViewChange,
  onSelectFinding,
}: {
  activeFindingId?: string | null;
  evaluation: Evaluation | null;
  lensView: LensView;
  onLensViewChange: (view: LensView) => void;
  onSelectFinding?: (id: string) => void;
}) => {
  if (!evaluation) {
    return (
      <div className="mt-4 space-y-5">
        <div>
          <p className="text-muted-foreground text-sm leading-6">
            Evaluate your sample to see its score, corrections, and suggestions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="bg-muted/40 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs">Score</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {evaluation.score}
        </p>
        <p className="mt-1 text-sm font-medium">{evaluation.band}</p>
        <p className="text-muted-foreground mt-3 text-xs leading-5 break-words">
          {evaluation.summary}
        </p>
      </div>

      <fieldset className="bg-muted mt-4 grid grid-cols-3 rounded-md p-1">
        <legend className="sr-only">Evidence view</legend>
        {(["findings", "corrected", "suggestions"] as const).map((view) => (
          <button
            aria-pressed={lensView === view}
            className="aria-pressed:bg-background focus-visible:ring-ring rounded-sm px-1 py-2 text-xs font-medium capitalize outline-none focus-visible:ring-2 aria-pressed:shadow-sm"
            key={view}
            onClick={() => onLensViewChange(view)}
            type="button"
          >
            {LENS_VIEW_LABELS[view]}
          </button>
        ))}
      </fieldset>

      <section aria-label={`${lensView} evidence`}>
        {lensView === "findings" ? (
          <EvidenceFindings
            activeFindingId={activeFindingId}
            evaluation={evaluation}
            onSelectFinding={onSelectFinding}
          />
        ) : null}
        {lensView === "corrected" ? (
          <div className="bg-muted/30 mt-4 rounded-xl border p-3">
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {evaluation.correctedText}
            </p>
          </div>
        ) : null}
        {lensView === "suggestions" ? (
          <EvidenceSuggestions
            activeFindingId={activeFindingId}
            evaluation={evaluation}
            onSelectFinding={onSelectFinding}
          />
        ) : null}
      </section>

      <Link
        className="focus-visible:ring-ring mt-4 inline-flex items-center gap-1 rounded-sm text-xs font-medium outline-none focus-visible:ring-2"
        params={{ evaluationId: evaluation.id }}
        to="/evaluations/$evaluationId"
      >
        Open evaluation
        <ChevronRight aria-hidden="true" className="size-3" />
      </Link>
    </div>
  );
};

export const WritingDesk = ({
  evaluationClient,
  onEvaluationCreated,
  progressSummary,
  recentEvaluations,
  setupStatus,
}: WritingDeskProps) => {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [lensView, setLensView] = useState<LensView>("findings");
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [failureMessage, setFailureMessage] = useState("");
  const [writingSample, setWritingSample] = useState("");
  const evidenceLensRef = useRef<HTMLElement>(null);
  const submissionInFlightRef = useRef(false);
  const isPending = status === "pending";
  const providerNeedsConfiguration = setupStatus.configured === false;
  const hasChangedSinceEvaluation =
    evaluation !== null && evaluation.originalText !== writingSample;

  const handleAcceptFinding = (mark: TextMark) => {
    if (!mark.finding) return;
    const correction = mark.finding.correction;
    const original = mark.originalText;

    let updated = writingSample;
    if (updated.includes(original)) {
      updated = updated.replace(original, correction);
    } else {
      updated =
        updated.slice(0, mark.start) + correction + updated.slice(mark.end);
    }
    setWritingSample(updated);
    toast.success(`Applied correction: ${correction}`);
  };

  const handleAcceptAllFindings = () => {
    if (!evaluation || evaluation.findings.length === 0) return;
    let updated = writingSample;
    const reversed = [...evaluation.findings].reverse();
    for (const finding of reversed) {
      if (updated.includes(finding.originalText)) {
        updated = updated.replace(finding.originalText, finding.correction);
      }
    }
    setWritingSample(updated);
    toast.success(`Applied all ${evaluation.findings.length} corrections`);
  };

  useEffect(() => {
    if (status === "success") {
      evidenceLensRef.current?.focus();
    }
  }, [status]);

  const handleWritingSampleChange = (value: string) => {
    setWritingSample(value);

    if (status !== "pending") {
      setStatus("idle");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      writingSample.trim().length === 0 ||
      !setupStatus.configured ||
      isPending ||
      submissionInFlightRef.current
    ) {
      return;
    }

    submissionInFlightRef.current = true;
    setStatus("pending");

    try {
      const result = await evaluationClient.evaluateWriting(writingSample);

      if (result.kind === "no-english") {
        submissionInFlightRef.current = false;
        setStatus("no-english");
        return;
      }

      submissionInFlightRef.current = false;
      setEvaluation(result.evaluation);
      setLensView("findings");
      setStatus("success");
      onEvaluationCreated();
    } catch (error) {
      submissionInFlightRef.current = false;
      setFailureMessage(describeEvaluationFailure(error));
      setStatus("failure");
    }
  };

  let actionLabel = "Evaluate writing";

  if (isPending) {
    actionLabel = "Evaluating writing…";
  } else if (status === "failure") {
    actionLabel = "Retry evaluation";
  } else if (evaluation) {
    actionLabel = hasChangedSinceEvaluation
      ? "Evaluate changes"
      : "Evaluate again";
  }

  const feedbackId =
    status === "failure" || status === "no-english"
      ? "writing-sample-feedback"
      : undefined;
  const describedBy = ["writing-sample-privacy", feedbackId]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Writing workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Writing Desk
          </h1>
        </div>
        <p className="text-muted-foreground max-w-md text-sm sm:text-right">
          Write, then review feedback.
        </p>
      </header>

      <div className="grid min-h-[36rem] overflow-hidden rounded-2xl border lg:grid-cols-[14rem_minmax(0,1fr)_22rem]">
        <section
          aria-label="Writing editor"
          className="order-1 flex min-w-0 flex-col lg:col-start-2 lg:row-start-1"
        >
          <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold" id="writing-sample-heading">
                Writing Sample
              </h2>
              <p className="text-muted-foreground text-xs">
                Only English passages are evaluated.
              </p>
            </div>
            <p className="text-muted-foreground shrink-0 text-xs">
              {evaluation ? "Saved" : "Unsaved draft"}
            </p>
          </div>

          {evaluation ? (
            <div className="border-b bg-muted/10 p-4 sm:p-5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-primary" />
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    SpellChecker on text
                  </h3>
                </div>
                <span className="text-muted-foreground text-xs">
                  Click any underlined word to inspect or accept
                </span>
              </div>
              <SpellChecker
                activeMarkId={activeFindingId}
                findings={evaluation.findings}
                onAccept={handleAcceptFinding}
                onAcceptAll={handleAcceptAllFindings}
                onActiveMarkChange={setActiveFindingId}
                suggestions={evaluation.suggestions}
                text={evaluation.originalText}
              />
            </div>
          ) : null}

          <form
            aria-busy={isPending}
            className="flex min-h-[20rem] flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <Label className="sr-only" htmlFor="writing-sample">
              Writing Sample
            </Label>
            <p
              className="bg-muted/20 text-muted-foreground border-b px-5 py-3 text-xs leading-5"
              id="writing-sample-privacy"
            >
              Typing stays local. Evaluating sends this sample to{" "}
              {setupStatus.provider}; the evaluation is saved at{" "}
              <code>{setupStatus.dataLocation}</code>.
            </p>

            {evaluation ? (
              <div className="bg-muted/20 text-muted-foreground flex items-center justify-between border-b px-5 py-2 text-xs">
                <span className="font-medium">Draft editor</span>
                <span className="text-[11px]">
                  Updates automatically when corrections are accepted
                </span>
              </div>
            ) : null}

            <Textarea
              aria-describedby={describedBy}
              aria-invalid={status === "no-english" || undefined}
              className={cn(
                "focus-visible:ring-ring resize-y border-0 p-5 text-base leading-8 shadow-none focus-visible:ring-2 focus-visible:ring-inset",
                evaluation
                  ? "min-h-36 sm:min-h-48"
                  : "min-h-56 sm:min-h-72 flex-1"
              )}
              id="writing-sample"
              onChange={(event) =>
                handleWritingSampleChange(event.currentTarget.value)
              }
              onKeyDown={handleComposerKeyDown}
              placeholder="Paste or write here…"
              readOnly={isPending}
              value={writingSample}
            />

            <div className="space-y-3 border-t p-4">
              {providerNeedsConfiguration && (
                <div
                  className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm"
                  role="alert"
                >
                  <p className="font-medium">Provider setup required.</p>
                  <Link
                    className="mt-1 inline-flex text-xs font-medium underline underline-offset-4"
                    to="/setup"
                  >
                    Open setup
                  </Link>
                </div>
              )}

              {status === "no-english" ? (
                <div
                  className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm"
                  id="writing-sample-feedback"
                  role="alert"
                >
                  <p className="font-medium">
                    Add English text before evaluating.
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    Code, commands, structured data, and non-English text alone
                    are not evaluated.
                  </p>
                </div>
              ) : null}

              {status === "failure" ? (
                <div
                  className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm"
                  id="writing-sample-feedback"
                  role="alert"
                >
                  <p className="font-medium">
                    Evaluation failed. Your text is still here.
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {failureMessage}
                  </p>
                </div>
              ) : null}

              <output aria-live="polite">
                {isPending ? (
                  <p className="text-muted-foreground text-sm">
                    Evaluating writing…
                  </p>
                ) : null}
                {status === "success" && evaluation ? (
                  <p className="sr-only">
                    Evaluation complete. Overall Score {evaluation.score},{" "}
                    {evaluation.band}. {evaluation.findings.length} Findings.
                  </p>
                ) : null}
              </output>

              {hasChangedSinceEvaluation ? (
                <p className="text-muted-foreground text-xs">
                  Draft changed. Evaluate again to update feedback.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                  <Command aria-hidden="true" className="size-3" />
                  Ctrl/⌘ + Enter
                </span>
                <Button
                  className="rounded-lg px-4"
                  disabled={
                    writingSample.trim().length === 0 ||
                    !setupStatus.configured ||
                    isPending
                  }
                  type="submit"
                >
                  <Sparkles aria-hidden="true" />
                  {actionLabel}
                </Button>
              </div>
            </div>
          </form>
        </section>

        <aside
          aria-labelledby="evidence-lens-heading"
          className="order-2 border-t p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset lg:col-start-3 lg:row-start-1 lg:border-t-0 lg:border-l"
          ref={evidenceLensRef}
          tabIndex={-1}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold" id="evidence-lens-heading">
              Feedback
            </h2>
            <ShieldCheck
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
          </div>

          <EvidenceLensContent
            activeFindingId={activeFindingId}
            evaluation={evaluation}
            lensView={lensView}
            onLensViewChange={setLensView}
            onSelectFinding={setActiveFindingId}
          />
        </aside>

        <RecentEvaluations
          evaluations={recentEvaluations}
          progressSummary={progressSummary}
        />
      </div>
    </main>
  );
};
