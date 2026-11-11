import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

import {
  PROGRESS_CLOCK,
  duplicateCategoryEvaluation,
  progressEvaluations,
  withinSevenDaysEvaluation,
} from "./-progress.fixtures";

const renderProgress = (initialEntry = "/progress") => {
  const router = createAppRouter({
    evaluationClient: createInMemoryEvaluationClient({
      currentRubricVersion: "1",
      now: () => new Date(PROGRESS_CLOCK),
      seededEvaluations: progressEvaluations,
    }),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(<RouterProvider router={router} />);

  return router;
};

describe("Progress", () => {
  test("each period window contains exactly its retained Evaluations", async () => {
    const user = userEvent.setup();

    renderProgress();

    const summary = await screen.findByRole("region", {
      name: "Period summary",
    });
    expect(summary).toHaveTextContent("Rubric v1");
    expect(summary).toHaveTextContent("Last 30 days");
    expect(summary).toHaveTextContent("2 evaluations");

    const findingRate = screen.getByRole("region", { name: "Finding rate" });
    expect(findingRate).toHaveTextContent("3 findings");
    expect(screen.getByRole("link", { name: "Last 30 days" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(screen.getByRole("link", { name: "Last 7 days" }));

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("1 evaluation");
    expect(
      screen.getByRole("region", { name: "Finding rate" })
    ).toHaveTextContent("1 finding");
    expect(screen.getByRole("link", { name: "Last 7 days" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(screen.getByRole("link", { name: "All history" }));

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("3 evaluations");
    expect(
      screen.getByRole("region", { name: "Finding rate" })
    ).toHaveTextContent("4 findings");
  });

  test("incompatible Rubric Versions stay separate and labeled", async () => {
    renderProgress();

    const findingRate = await screen.findByRole("region", {
      name: "Finding rate",
    });
    expect(findingRate).toHaveTextContent("2 evaluations");
    expect(findingRate).toHaveTextContent("200 English words");
    expect(findingRate).toHaveTextContent("3 findings");

    const incompatible = screen.getByRole("region", {
      name: "Other rubric versions",
    });
    expect(incompatible).toHaveTextContent("Rubric v2");
    expect(incompatible).toHaveTextContent("1 evaluation");
    expect(incompatible).toHaveTextContent("50 English words");
    expect(incompatible).toHaveTextContent("1 finding");
    expect(incompatible).toHaveTextContent(
      "These evaluations use another rubric, so they are shown separately."
    );

    expect(
      screen.getByRole("region", { name: "Recurring categories" })
    ).not.toHaveTextContent("Clarity");
  });

  test("primary rate, secondary score, and descriptive measures", async () => {
    renderProgress();

    const findingRate = await screen.findByRole("region", {
      name: "Finding rate",
    });
    expect(findingRate).toHaveTextContent("1.5 per 100 words");
    const averageScore = screen.getByRole("region", {
      name: "Average score",
    });
    expect(averageScore).toHaveTextContent("80");
    expect(averageScore).toHaveTextContent("Clear");

    const recurrence = screen.getByRole("region", {
      name: "Recurring categories",
    });
    expect(
      within(recurrence)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Spelling100% · 2 evaluations", "Article50% · 1 evaluation"]);
    expect(
      within(recurrence).getByRole("figure", {
        name: "Spelling: 100% recurrence",
      })
    ).toBeInTheDocument();

    const distribution = screen.getByRole("region", {
      name: "Findings by category",
    });
    expect(
      within(distribution)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Spelling2 findings", "Article1 finding"]);
    expect(
      within(distribution).getByRole("figure", {
        name: "Spelling: 2 findings",
      })
    ).toBeInTheDocument();

    const corrections = screen.getByRole("region", {
      name: "Recurring corrections",
    });
    expect(
      within(corrections)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["tset → test2 occurrences"]);

    expect(screen.queryByText(/could/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/might/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/improved|declined/iu)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Progress" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Period" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Progress evidence" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Progress evidence" })
    ).toHaveTextContent("Select a metric or category to see its evaluations.");
    const work = screen.getByRole("region", {
      name: "Progress",
    });
    const lens = screen.getByRole("region", { name: "Progress evidence" });
    const context = screen.getByRole("navigation", {
      name: "Progress period",
    });
    expect(work.compareDocumentPosition(lens)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(lens.compareDocumentPosition(context)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      screen.queryByText(/metrics|statistics|trends/iu)
    ).not.toBeInTheDocument();
  });

  test("sparse evidence stays descriptive", async () => {
    renderProgress("/progress?period=7-days");

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("1 evaluation");

    const findingRate = screen.getByRole("region", { name: "Finding rate" });
    expect(findingRate).toHaveTextContent("1 per 100 words");
    expect(findingRate).toHaveTextContent("100 English words");

    expect(
      screen.getByRole("region", { name: "Average score" })
    ).toHaveTextContent("90");
    expect(
      screen.queryByRole("region", { name: "Recurring corrections" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/improved|declined/iu)).not.toBeInTheDocument();
  });

  test("an Error Category selection reveals its exact source Findings", async () => {
    const user = userEvent.setup();

    renderProgress();

    const recurrence = await screen.findByRole("region", {
      name: "Recurring categories",
    });
    await user.click(
      within(recurrence).getByRole("link", { name: /Spelling/u })
    );

    const evidence = await screen.findByRole("region", { name: "Evidence" });
    expect(
      within(evidence).getByRole("heading", { level: 2 })
    ).toHaveTextContent("Spelling");

    const sourceFindings = within(evidence).getByRole("list", {
      name: "Findings",
    });
    const items = within(sourceFindings).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("tset → test");
    expect(items[0]).toHaveTextContent("Minor");
    expect(items[0]).toHaveTextContent("One spelling correction");
    expect(items[1]).toHaveTextContent("Spelling and article corrections");
    const explanations = within(sourceFindings).getAllByText(
      "The letters were reversed."
    );
    for (const explanation of explanations) {
      expect(explanation).toHaveClass("wrap-anywhere");
    }
    expect(evidence).not.toHaveTextContent("documentation");
    expect(evidence).not.toHaveTextContent("could");
    expect(evidence).not.toHaveTextContent("might");

    await user.click(
      within(items[0] as HTMLElement).getByRole("link", {
        name: "Open evaluation",
      })
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "One spelling correction",
      })
    ).toBeInTheDocument();
  });

  test("one Evaluation counts once per category but reveals every Finding", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        currentRubricVersion: "1",
        now: () => new Date(PROGRESS_CLOCK),
        seededEvaluations: [
          duplicateCategoryEvaluation,
          withinSevenDaysEvaluation,
        ],
      }),
      history: createMemoryHistory({ initialEntries: ["/progress"] }),
    });

    render(<RouterProvider router={router} />);

    const recurrence = await screen.findByRole("region", {
      name: "Recurring categories",
    });
    expect(recurrence).toHaveTextContent("Spelling100% · 2 evaluations");
    expect(
      screen.getByRole("region", {
        name: "Findings by category",
      })
    ).toHaveTextContent("Spelling3 findings");

    await user.click(
      within(recurrence).getByRole("link", { name: /Spelling/u })
    );

    const evidence = await screen.findByRole("region", { name: "Evidence" });
    expect(
      within(
        within(evidence).getByRole("list", { name: "Findings" })
      ).getAllByRole("listitem")
    ).toHaveLength(3);
    expect(router.state.location.search).toMatchObject({
      category: "Spelling",
      insight: "category",
      period: "30-days",
    });
  });

  test("recurring Correction and summary selections reveal their evidence", async () => {
    const user = userEvent.setup();

    renderProgress();

    const corrections = await screen.findByRole("region", {
      name: "Recurring corrections",
    });
    await user.click(
      within(corrections).getByRole("link", { name: /tset → test/u })
    );

    let evidence = await screen.findByRole("region", { name: "Evidence" });
    expect(
      within(evidence).getByRole("heading", { level: 2 })
    ).toHaveTextContent("tset → test");
    expect(
      within(
        within(evidence).getByRole("list", { name: "Findings" })
      ).getAllByRole("listitem")
    ).toHaveLength(2);

    await user.click(
      within(screen.getByRole("region", { name: "Finding rate" })).getByRole(
        "link",
        { name: "See findings" }
      )
    );

    evidence = await screen.findByRole("region", { name: "Evidence" });
    expect(
      within(evidence).getByRole("heading", { level: 2 })
    ).toHaveTextContent("Finding rate");
    expect(
      within(
        within(evidence).getByRole("list", { name: "Findings" })
      ).getAllByRole("listitem")
    ).toHaveLength(3);
    expect(
      within(
        within(evidence).getByRole("list", { name: "Evaluations" })
      ).getAllByRole("listitem")
    ).toHaveLength(2);

    await user.click(
      within(screen.getByRole("region", { name: "Average score" })).getByRole(
        "link",
        { name: "See evaluations" }
      )
    );

    evidence = await screen.findByRole("region", { name: "Evidence" });
    expect(
      within(evidence).getByRole("heading", { level: 2 })
    ).toHaveTextContent("Average score");
    expect(
      within(evidence).queryByRole("list", { name: "Findings" })
    ).not.toBeInTheDocument();
    const contributing = within(evidence).getByRole("list", {
      name: "Evaluations",
    });
    expect(within(contributing).getAllByRole("listitem")).toHaveLength(2);
    expect(contributing).toHaveTextContent("90");
    expect(contributing).toHaveTextContent("70");
  });

  test("deletion recomputes Progress even after an intent preload", async () => {
    const user = userEvent.setup();
    renderProgress();

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("2 evaluations");

    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(
      await screen.findByRole("link", { name: /One spelling correction/u })
    );
    const deleteTrigger = await screen.findByRole("button", {
      name: "Delete evaluation",
    });
    await user.click(deleteTrigger);
    await user.click(
      await screen.findByRole("button", { name: "Delete permanently" })
    );
    await screen.findByRole("heading", { level: 1, name: "History" });

    await user.click(screen.getByRole("link", { name: "Progress" }));

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("1 evaluation");
    const findingRate = screen.getByRole("region", { name: "Finding rate" });
    expect(findingRate).toHaveTextContent("2 per 100 words");
    expect(findingRate).toHaveTextContent("2 findings");
    expect(
      screen.queryByRole("region", { name: "Recurring corrections" })
    ).not.toBeInTheDocument();
  });

  test("repeated Writing Samples remain separate observations", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        now: () => new Date(PROGRESS_CLOCK),
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { level: 1, name: "Writing Desk" });
    await router.preloadRoute({ to: "/progress" });

    const submitWritingSample = async () => {
      await user.type(
        screen.getByRole("textbox", { name: "Writing Sample" }),
        "This writing needs no correction."
      );
      await user.click(
        screen.getByRole("button", { name: "Evaluate writing" })
      );
      await screen.findAllByText("No errors found.");
    };

    const submitAgain = async () => {
      await user.click(screen.getByRole("button", { name: "Evaluate again" }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Evaluate again" })
        ).toBeEnabled();
      });
    };

    await submitWritingSample();
    await submitAgain();

    await user.click(screen.getByRole("link", { name: "Progress" }));

    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("2 evaluations");
    expect(
      screen.getByRole("region", { name: "Finding rate" })
    ).toHaveTextContent("18 English words");
  });

  test("no compatible evidence shows an honest empty state", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await user.click(await screen.findByRole("link", { name: "Progress" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Progress" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("No evaluations in this period.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Finding rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Average score")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Recurring categories" })
    ).not.toBeInTheDocument();

    const evaluateLink = screen.getByRole("link", {
      name: "Evaluate a writing sample",
    });
    expect(evaluateLink).toHaveAttribute("href", "/");
    await user.click(evaluateLink);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Writing Desk" })
    ).toBeInTheDocument();
  });

  test("keeps long unbroken source explanations reachable", async () => {
    const longExplanation = "evidence".repeat(100);
    const sourceEvaluation = {
      ...withinSevenDaysEvaluation,
      findings: [
        {
          ...withinSevenDaysEvaluation.findings[0],
          explanation: longExplanation,
        },
      ],
      id: "long-source-evidence",
    };
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        currentRubricVersion: "1",
        now: () => new Date(PROGRESS_CLOCK),
        seededEvaluations: [sourceEvaluation],
      }),
      history: createMemoryHistory({
        initialEntries: [
          "/progress?period=30-days&insight=category&category=Spelling",
        ],
      }),
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(longExplanation)).toHaveClass(
      "wrap-anywhere"
    );
  });
});
