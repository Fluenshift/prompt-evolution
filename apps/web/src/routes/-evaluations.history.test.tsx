import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import type {
  Evaluation,
  ProficiencyBand,
} from "@/features/evaluations/evaluation-client";
import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import type { InMemoryEvaluationScenario } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

const evaluationFixture = ({
  band,
  evaluatedAt,
  id,
  score,
  summary,
}: {
  band: ProficiencyBand;
  evaluatedAt: string;
  id: string;
  score: number;
  summary: string;
}): Evaluation => ({
  band,
  correctedText: "Corrected writing.",
  evaluatedAt,
  evaluatedEnglishWordCount: 2,
  findings: [],
  id,
  model: "fixture-model",
  originalText: "Original writing.",
  provider: "Fixture provider",
  rubricVersion: "1",
  score,
  suggestions: [],
  summary,
});

const createdScenario = (summary: string): InMemoryEvaluationScenario => ({
  correctedText: { kind: "submitted-writing" },
  detail: {
    band: "Natural",
    evaluatedAt: "2026-09-03T12:00:00.000Z",
    evaluatedEnglishWordCount: 3,
    findings: [],
    model: "fixture-model",
    provider: "Fixture provider",
    rubricVersion: "1",
    score: 100,
    suggestions: [],
    summary,
  },
  kind: "created",
});

describe("History", () => {
  test("empty history points the Learner to their first Evaluation", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({ initialEntries: ["/evaluations"] }),
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { name: "History" })
    ).toBeInTheDocument();
    expect(screen.getByText("No evaluations yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Evaluate a writing sample" })
    ).toHaveAttribute("href", "/");
    const work = screen.getByRole("region", {
      name: "Evaluations",
    });
    const lens = screen.getByRole("complementary", {
      name: "About history",
    });
    const context = screen.getByRole("complementary", {
      name: "All evaluations",
    });
    expect(lens).toHaveTextContent(
      "Each evaluation keeps submitted writing and feedback together."
    );
    expect(context).toHaveTextContent("No evaluations");
    expect(work.compareDocumentPosition(lens)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(lens.compareDocumentPosition(context)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/evaluations"
    );
  });

  test("populated history shows every Evaluation newest first", async () => {
    const older = evaluationFixture({
      band: "Clear",
      evaluatedAt: "2026-08-30T12:00:00.000Z",
      id: "older-evaluation",
      score: 80,
      summary: "Older summary",
    });
    const newest = evaluationFixture({
      band: "Natural",
      evaluatedAt: "2026-09-02T12:00:00.000Z",
      id: "newest-evaluation",
      score: 91,
      summary: "Newest summary",
    });
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        seededEvaluations: [older, newest],
      }),
      history: createMemoryHistory({ initialEntries: ["/evaluations"] }),
    });

    render(<RouterProvider router={router} />);

    const history = await screen.findByRole("list", { name: "Evaluations" });
    const rows = within(history).getAllByRole("listitem");

    expect(
      rows.map((row) => within(row).getByRole("heading").textContent)
    ).toEqual(["Newest summary", "Older summary"]);
    expect(rows[0]).toHaveTextContent("Sep 2, 2026");
    expect(within(rows[0]).getByText("Score")).toBeInTheDocument();
    expect(within(rows[0]).getByText("91")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Band")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Natural")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("v1");
    expect(
      screen.getByRole("complementary", { name: "All evaluations" })
    ).toHaveTextContent("2 evaluations");
    expect(screen.queryByText("No evaluations yet.")).not.toBeInTheDocument();
  });

  test("selecting a History row reopens its complete Evaluation", async () => {
    const evaluation = {
      ...evaluationFixture({
        band: "Natural",
        evaluatedAt: "2026-09-01T12:00:00.000Z",
        id: "evaluation-to-reopen",
        score: 89,
        summary: "Reopen this Evaluation",
      }),
      correctedText: "This writing is corrected.",
      originalText: "This writing need correction.",
    };
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        seededEvaluations: [evaluation],
      }),
      history: createMemoryHistory({ initialEntries: ["/evaluations"] }),
    });

    render(<RouterProvider router={router} />);

    await user.click(
      await screen.findByRole("link", { name: /Reopen this Evaluation/u })
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Reopen this Evaluation",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This writing need correction.")
    ).toBeInTheDocument();
    expect(screen.getByText("This writing is corrected.")).toBeInTheDocument();
  });

  test("repeated Writing Samples remain distinct newest-first observations", async () => {
    const writingSample = "Check the same writing twice.";
    const evaluationClient = createInMemoryEvaluationClient({
      attempts: [
        createdScenario("First observation"),
        createdScenario("Second observation"),
      ],
    });

    await evaluationClient.evaluateWriting(writingSample);
    await evaluationClient.evaluateWriting(writingSample);

    const router = createAppRouter({
      evaluationClient,
      history: createMemoryHistory({ initialEntries: ["/evaluations"] }),
    });

    render(<RouterProvider router={router} />);

    const history = await screen.findByRole("list", { name: "Evaluations" });
    const recordLinks = within(history).getAllByRole("link");

    expect(
      within(history)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Second observation", "First observation"]);
    expect(recordLinks).toHaveLength(2);
    expect(recordLinks[0]).not.toHaveAttribute(
      "href",
      recordLinks[1]?.getAttribute("href")
    );
  });
});
