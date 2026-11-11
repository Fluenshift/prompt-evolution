import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import type { Evaluation } from "@/features/evaluations/evaluation-client";
import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

const evaluation = {
  band: "Natural",
  correctedText: "Review why the test fails.",
  evaluatedAt: "2026-09-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 5,
  findings: [
    {
      category: "Spelling",
      correction: "test",
      explanation: "The letters were reversed.",
      originalText: "tset",
      severity: "Minor",
    },
  ],
  id: "evaluation-to-delete",
  model: "fixture-model",
  originalText: "Review why the tset fails.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score: 85,
  suggestions: [
    {
      alternative: "Explain why the test fails.",
      explanation: "The preferred verb depends on the intended request.",
      originalText: "Review why the test fails.",
    },
  ],
  summary: "Evaluation retained after cancel",
} satisfies Evaluation;

describe("Evaluation deletion", () => {
  test("the safe cancel path explains deletion and keeps the Evaluation", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        seededEvaluations: [evaluation],
      }),
      history: createMemoryHistory({
        initialEntries: [`/evaluations/${evaluation.id}`],
      }),
    });

    render(<RouterProvider router={router} />);

    const deleteTrigger = await screen.findByRole(
      "button",
      { name: "Delete evaluation" },
      { timeout: 3000 }
    );
    await user.click(deleteTrigger);

    const confirmation = await screen.findByRole("dialog", {
      name: "Delete evaluation?",
    });
    expect(confirmation).toHaveTextContent("Sep 1, 2026");
    expect(confirmation).toHaveTextContent(
      "This deletes the writing sample and its feedback from local storage."
    );
    expect(confirmation).toHaveTextContent("Progress will update");

    const cancel = within(confirmation).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    await user.click(cancel);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteTrigger).toHaveFocus();

    await user.click(screen.getByRole("link", { name: "History" }));
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Evaluation retained after cancel",
      })
    ).toBeInTheDocument();
  });

  test("confirmation removes only that complete record and returns to History", async () => {
    const retainedEvaluation = {
      ...evaluation,
      evaluatedAt: "2026-08-31T12:00:00.000Z",
      id: "evaluation-to-retain",
      summary: "Evaluation that remains",
    };
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        seededEvaluations: [retainedEvaluation, evaluation],
      }),
      history: createMemoryHistory({
        initialEntries: ["/evaluations"],
      }),
    });

    render(<RouterProvider router={router} />);

    await user.click(
      await screen.findByRole("link", {
        name: /Evaluation retained after cancel/u,
      })
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete evaluation" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete permanently" })
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "History" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Evaluation deleted.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        level: 3,
        name: "Evaluation retained after cancel",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Evaluation that remains",
      })
    ).toBeInTheDocument();

    await router.navigate({
      params: { evaluationId: evaluation.id },
      to: "/evaluations/$evaluationId",
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Evaluation not found",
      })
    ).toBeInTheDocument();
  });

  test("a failed deletion keeps the record and offers a safe retry", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        deletionAttempts: [
          { error: new Error("Storage unavailable"), kind: "failure" },
          { kind: "deleted" },
        ],
        seededEvaluations: [evaluation],
      }),
      history: createMemoryHistory({
        initialEntries: [`/evaluations/${evaluation.id}`],
      }),
    });

    render(<RouterProvider router={router} />);

    await user.click(
      await screen.findByRole("button", { name: "Delete evaluation" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete permanently" })
    );

    const confirmation = await screen.findByRole("dialog", {
      name: "Delete evaluation?",
    });
    expect(await within(confirmation).findByRole("alert")).toHaveTextContent(
      "Could not delete evaluation. The record was kept."
    );
    expect(
      within(confirmation).getByRole("button", { name: "Retry deletion" })
    ).toBeEnabled();
    expect(
      within(confirmation).getByRole("button", { name: "Cancel" })
    ).toBeEnabled();

    await user.click(
      within(confirmation).getByRole("button", { name: "Retry deletion" })
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "History" })
    ).toBeInTheDocument();
    expect(screen.getByText("No evaluations yet.")).toBeInTheDocument();
  });
});
