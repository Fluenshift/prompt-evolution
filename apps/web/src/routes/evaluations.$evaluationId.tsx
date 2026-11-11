import {
  Button,
  buttonVariants,
} from "@english-prompt-evaluation/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@english-prompt-evaluation/ui/components/dialog";
import { cn } from "@english-prompt-evaluation/ui/lib/utils";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SpellChecker } from "@/features/evaluations/spell-checker";

const formatEvaluationDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

const routeApi = getRouteApi("/evaluations/$evaluationId");

const EvaluationDetailPage = () => {
  const { evaluationClient } = routeApi.useRouteContext();
  const { evaluation, recentEvaluations } = routeApi.useLoaderData();
  const navigate = routeApi.useNavigate();
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [hasDeletionFailure, setHasDeletionFailure] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  let deletionActionLabel = "Delete permanently";

  if (hasDeletionFailure) {
    deletionActionLabel = "Retry deletion";
  }
  if (isDeleting) {
    deletionActionLabel = "Deleting…";
  }

  if (!evaluation) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Evaluation not found
        </h1>
      </main>
    );
  }

  const handleDelete = async () => {
    setHasDeletionFailure(false);
    setIsDeleting(true);

    try {
      await evaluationClient.deleteEvaluation(evaluation.id);
    } catch {
      setHasDeletionFailure(true);
      setIsDeleting(false);
      return;
    }

    toast.success("Evaluation deleted.");
    await navigate({ to: "/evaluations" });
  };

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Evaluation · {formatEvaluationDate(evaluation.evaluatedAt)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">
            {evaluation.summary}
          </h1>
        </div>
        <Link
          className="focus-visible:ring-ring text-muted-foreground hover:text-foreground w-fit rounded-sm text-sm font-medium outline-none focus-visible:ring-2"
          to="/evaluations"
        >
          Back to history
        </Link>
      </header>

      <div className="grid overflow-hidden rounded-2xl border lg:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="comparison-heading"
          className="min-w-0 lg:col-start-2 lg:row-start-1"
        >
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold" id="comparison-heading">
              Original and corrected text
            </h2>
          </div>

          <section aria-label="Original" className="border-b px-5 py-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Original
                </h3>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Click or hover any underlined text to review findings
                </p>
              </div>
            </div>
            <SpellChecker
              activeMarkId={activeFindingId}
              findings={evaluation.findings}
              onActiveMarkChange={setActiveFindingId}
              readOnly={true}
              suggestions={evaluation.suggestions}
              text={evaluation.originalText}
            />
          </section>

          <section aria-label="Corrected" className="border-b px-5 py-5">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Corrected
            </h3>
            <p className="mt-3 text-sm leading-7 break-words whitespace-pre-wrap">
              {evaluation.correctedText}
            </p>
          </section>

          <section aria-labelledby="context-heading" className="px-5 py-5">
            <h3 className="text-sm font-semibold" id="context-heading">
              Details
            </h3>
            <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Provider</dt>
                <dd className="mt-1 font-medium">{evaluation.provider}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Model</dt>
                <dd className="mt-1 font-mono text-xs">{evaluation.model}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Rubric</dt>
                <dd className="mt-1 font-medium">
                  Rubric v{evaluation.rubricVersion}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">English words</dt>
                <dd className="mt-1 font-medium">
                  {evaluation.evaluatedEnglishWordCount}
                </dd>
              </div>
            </dl>
          </section>
        </section>

        <aside
          aria-labelledby="evidence-lens-heading"
          className="border-t p-4 lg:col-start-3 lg:row-start-1 lg:border-t-0 lg:border-l"
        >
          <h2 className="text-sm font-semibold" id="evidence-lens-heading">
            Feedback
          </h2>

          <div className="bg-muted/40 mt-4 rounded-xl border p-4">
            <p className="text-muted-foreground text-xs">Score</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {evaluation.score}
            </p>
            <p className="mt-1 text-sm font-medium">{evaluation.band}</p>
            <p className="text-muted-foreground mt-3 text-xs leading-5">
              {evaluation.summary}
            </p>
          </div>

          <section aria-labelledby="findings-heading" className="mt-5">
            <h3 className="text-sm font-semibold" id="findings-heading">
              Findings
            </h3>
            {evaluation.findings.length === 0 ? (
              <p className="mt-4 rounded-xl border p-3 text-sm font-medium">
                No errors found.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {evaluation.findings.map((finding, findingIndex) => {
                  const headingId = `finding-${findingIndex}-heading`;
                  const markId = `finding-${findingIndex}`;
                  const isActive = activeFindingId === markId;

                  return (
                    <li
                      key={`${finding.category}-${finding.originalText}-${findingIndex}`}
                    >
                      <article
                        aria-labelledby={headingId}
                        className={cn(
                          "border-l-destructive bg-muted/20 rounded-xl border border-l-4 p-3 transition-all cursor-pointer hover:bg-muted/40",
                          isActive &&
                            "ring-2 ring-destructive border-destructive bg-destructive/5 shadow-xs"
                        )}
                        onClick={() => setActiveFindingId(markId)}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold" id={headingId}>
                            {finding.category} · {finding.severity}
                          </h4>
                          <span className="text-[10px] text-muted-foreground hover:text-foreground">
                            Jump to text →
                          </span>
                        </div>
                        <dl className="mt-3 space-y-3">
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Original
                            </dt>
                            <dd className="decoration-destructive/60 mt-1 text-sm font-medium break-words line-through">
                              {finding.originalText}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Correction
                            </dt>
                            <dd className="mt-1 text-sm font-medium break-words">
                              {finding.correction}
                            </dd>
                          </div>
                        </dl>
                        <p className="text-muted-foreground mt-3 text-xs leading-5 break-words">
                          {finding.explanation}
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section
            aria-labelledby="suggestions-heading"
            className="mt-5 border-t pt-5"
          >
            <h3 className="text-sm font-semibold" id="suggestions-heading">
              Suggestions
            </h3>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Optional wording changes. They do not affect your score.
            </p>
            {evaluation.suggestions.length === 0 ? (
              <p className="bg-muted/20 mt-4 rounded-xl border p-3 text-sm">
                No suggestions for this sample.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {evaluation.suggestions.map((suggestion, suggestionIndex) => {
                  const markId = `suggestion-${suggestionIndex}`;
                  const isActive = activeFindingId === markId;

                  return (
                    <li
                      className={cn(
                        "bg-muted/20 rounded-xl border p-3 transition-all cursor-pointer hover:bg-muted/40",
                        isActive &&
                          "ring-2 ring-amber-500 border-amber-500 bg-amber-500/10 shadow-xs"
                      )}
                      key={`${suggestion.originalText}-${suggestionIndex}`}
                      onClick={() => setActiveFindingId(markId)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Optional wording</p>
                        <span className="text-[10px] text-muted-foreground hover:text-foreground">
                          Jump to text →
                        </span>
                      </div>
                      <dl className="mt-3 space-y-3">
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Original
                          </dt>
                          <dd className="mt-1 text-sm break-words">
                            {suggestion.originalText}
                          </dd>
                        </div>
                        {suggestion.alternative ? (
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Alternative
                            </dt>
                            <dd className="mt-1 text-sm font-medium break-words">
                              {suggestion.alternative}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <p className="text-muted-foreground mt-3 text-xs leading-5 break-words">
                        {suggestion.explanation}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>

        <aside
          aria-labelledby="evaluation-navigation-heading"
          className="bg-muted/30 border-t p-4 lg:col-start-1 lg:row-start-1 lg:border-t-0 lg:border-r"
        >
          <h2
            className="text-xs font-semibold tracking-wider uppercase"
            id="evaluation-navigation-heading"
          >
            Nearby evaluations
          </h2>
          {recentEvaluations.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-xs leading-5">
              No other evaluations.
            </p>
          ) : (
            <ol aria-label="Nearby Evaluations" className="mt-4 space-y-1">
              {recentEvaluations.map((recent) => (
                <li key={recent.id}>
                  <Link
                    className="hover:bg-background focus-visible:ring-ring block rounded-lg p-2 outline-none focus-visible:ring-2"
                    params={{ evaluationId: recent.id }}
                    to="/evaluations/$evaluationId"
                  >
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={recent.evaluatedAt}
                    >
                      {formatEvaluationDate(recent.evaluatedAt)}
                    </time>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 font-medium break-words">
                      {recent.summary}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {recent.score} · {recent.band}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <section
            aria-labelledby="record-actions-heading"
            className="mt-6 border-t pt-4"
          >
            <h3 className="text-xs font-semibold" id="record-actions-heading">
              Actions
            </h3>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              This evaluation cannot be edited.
            </p>

            <Dialog
              onOpenChange={(open) => {
                if (!open) {
                  setHasDeletionFailure(false);
                }
              }}
            >
              <DialogTrigger
                className={buttonVariants({
                  className: "mt-4 w-full rounded-lg",
                  variant: "destructive",
                })}
              >
                Delete evaluation
              </DialogTrigger>
              <DialogContent>
                <div className="space-y-2">
                  <DialogTitle>Delete evaluation?</DialogTitle>
                  <DialogDescription className="space-y-2">
                    <span className="block">
                      Evaluation from{" "}
                      {formatEvaluationDate(evaluation.evaluatedAt)}.
                    </span>
                    <span className="block">
                      This deletes the writing sample and its feedback from
                      local storage.
                    </span>
                    <span className="block">Progress will update.</span>
                  </DialogDescription>
                </div>
                {hasDeletionFailure ? (
                  <div
                    className="border-destructive/30 bg-destructive/5 rounded-lg border p-4 text-sm"
                    role="alert"
                  >
                    <p className="font-medium">
                      Could not delete evaluation. The record was kept.
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Try again or cancel.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <DialogClose
                    className={buttonVariants({
                      className: "rounded-lg",
                      variant: "outline",
                    })}
                    disabled={isDeleting}
                  >
                    Cancel
                  </DialogClose>
                  <Button
                    className="rounded-lg"
                    disabled={isDeleting}
                    onClick={handleDelete}
                    type="button"
                    variant="destructive"
                  >
                    {deletionActionLabel}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </section>
        </aside>
      </div>
    </main>
  );
};

export const Route = createFileRoute("/evaluations/$evaluationId")({
  component: EvaluationDetailPage,
  loader: async ({ context, params }) => {
    const [evaluation, evaluations] = await Promise.all([
      context.evaluationClient.getEvaluation(params.evaluationId),
      context.evaluationClient.listEvaluations(),
    ]);

    return {
      evaluation,
      recentEvaluations: evaluations
        .filter((candidate) => candidate.id !== params.evaluationId)
        .slice(0, 5),
    };
  },
});
