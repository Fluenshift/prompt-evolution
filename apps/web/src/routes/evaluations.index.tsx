import { buttonVariants } from "@english-prompt-evaluation/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@english-prompt-evaluation/ui/components/empty";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

const routeApi = getRouteApi("/evaluations/");

const formatEvaluationDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

const HistoryPage = () => {
  const evaluations = routeApi.useLoaderData();
  const evaluationCount = evaluations.length;

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-muted-foreground text-sm">
            Your evaluations, newest first.
          </p>
        </div>
        <Link className={buttonVariants({ className: "rounded-lg" })} to="/">
          Write another sample
        </Link>
      </header>

      <div className="grid overflow-hidden rounded-2xl border xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="retained-evaluations-heading"
          className="min-w-0 xl:col-start-2 xl:row-start-1"
        >
          <div className="bg-muted/30 border-b px-4 py-3 sm:px-5">
            <h2
              className="text-sm font-semibold"
              id="retained-evaluations-heading"
            >
              Evaluations
            </h2>
          </div>
          {evaluationCount === 0 ? (
            <Empty className="min-h-72 border-0">
              <EmptyHeader>
                <EmptyTitle>No evaluations yet.</EmptyTitle>
                <EmptyDescription>
                  Evaluate a writing sample to start your history.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  className={buttonVariants({ className: "rounded-lg" })}
                  to="/"
                >
                  Evaluate a writing sample
                </Link>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <div
                aria-hidden="true"
                className="text-muted-foreground hidden grid-cols-[8rem_minmax(0,1fr)_4rem_8rem_6rem_1.25rem] gap-3 border-b px-5 py-2 text-xs font-medium tracking-wider uppercase md:grid"
              >
                <span>Date</span>
                <span>Summary</span>
                <span>Score</span>
                <span>Band</span>
                <span>Rubric</span>
                <span />
              </div>
              <ol aria-label="Evaluations" className="divide-y">
                {evaluations.map((evaluation) => (
                  <li key={evaluation.id}>
                    <Link
                      className="focus-visible:ring-ring hover:bg-muted/40 grid gap-3 px-4 py-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5 md:grid-cols-[8rem_minmax(0,1fr)_4rem_8rem_6rem_1.25rem] md:items-center md:gap-3"
                      params={{ evaluationId: evaluation.id }}
                      to="/evaluations/$evaluationId"
                    >
                      <time
                        className="text-muted-foreground text-xs"
                        dateTime={evaluation.evaluatedAt}
                      >
                        {formatEvaluationDate(evaluation.evaluatedAt)}
                      </time>
                      <h3 className="text-sm leading-6 font-medium break-words">
                        {evaluation.summary}
                      </h3>
                      <dl className="contents">
                        <div className="flex items-baseline justify-between gap-4 md:block">
                          <dt className="text-muted-foreground text-xs md:sr-only">
                            Score
                          </dt>
                          <dd className="text-sm font-semibold tabular-nums">
                            {evaluation.score}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 md:block">
                          <dt className="text-muted-foreground text-xs md:sr-only">
                            Band
                          </dt>
                          <dd className="text-sm font-medium">
                            {evaluation.band}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 md:block">
                          <dt className="text-muted-foreground text-xs md:sr-only">
                            Rubric
                          </dt>
                          <dd className="text-muted-foreground text-xs">
                            v{evaluation.rubricVersion}
                          </dd>
                        </div>
                      </dl>
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground hidden size-4 md:block"
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <aside
          aria-labelledby="history-evidence-lens-heading"
          className="border-t p-4 xl:col-start-3 xl:row-start-1 xl:border-t-0 xl:border-l"
        >
          <h2
            className="mt-3 text-sm font-semibold"
            id="history-evidence-lens-heading"
          >
            About history
          </h2>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            Each evaluation keeps submitted writing and feedback together.
          </p>
        </aside>

        <aside
          aria-labelledby="history-context-heading"
          className="bg-muted/30 border-t p-4 xl:col-start-1 xl:row-start-1 xl:border-t-0 xl:border-r"
        >
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            History
          </p>
          <h2
            className="mt-3 text-sm font-semibold"
            id="history-context-heading"
          >
            All evaluations
          </h2>
          <p className="text-muted-foreground mt-4 border-t pt-4 text-xs font-medium">
            {evaluationCount === 0
              ? "No evaluations"
              : `${evaluationCount} ${evaluationCount === 1 ? "evaluation" : "evaluations"}`}
          </p>
        </aside>
      </div>
    </main>
  );
};

export const Route = createFileRoute("/evaluations/")({
  component: HistoryPage,
  loader: ({ context }) => context.evaluationClient.listEvaluations(),
});
