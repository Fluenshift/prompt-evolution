import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import type { Evaluation } from "@/features/evaluations/evaluation-client";
import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

const evaluation = {
  band: "Natural",
  correctedText: "This approach could work.",
  evaluatedAt: "2026-09-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 4,
  findings: [],
  id: "evaluation-with-suggestion",
  model: "openai/gpt-5.6-terra",
  originalText: "This approach could work.",
  provider: "OpenRouter",
  rubricVersion: "1",
  score: 100,
  suggestions: [
    {
      alternative: "This approach might work.",
      explanation:
        "The best modal depends on how certain the Learner intends to sound.",
      originalText: "This approach could work.",
    },
  ],
  summary: "No errors found.",
} satisfies Evaluation;

const renderEvaluationDetail = (
  detail: Evaluation,
  otherEvaluations: readonly Evaluation[] = []
) => {
  const router = createAppRouter({
    evaluationClient: createInMemoryEvaluationClient({
      seededEvaluations: [...otherEvaluations, detail],
    }),
    history: createMemoryHistory({
      initialEntries: [`/evaluations/${detail.id}`],
    }),
  });

  render(<RouterProvider router={router} />);
};

test("Evaluation Detail uses accessible work, evidence, and history regions", async () => {
  const previousEvaluation = {
    ...evaluation,
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    id: "previous-evaluation",
    summary: "Previous retained evidence",
    suggestions: [],
  } satisfies Evaluation;

  renderEvaluationDetail(evaluation, [previousEvaluation]);

  const comparison = await screen.findByRole(
    "region",
    {
      name: "Original and corrected text",
    },
    { timeout: 3000 }
  );
  const evidenceLens = screen.getByRole("complementary", {
    name: "Feedback",
  });
  const historyRail = screen.getByRole("complementary", {
    name: "Nearby evaluations",
  });
  expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  expect(comparison.compareDocumentPosition(evidenceLens)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(evidenceLens.compareDocumentPosition(historyRail)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(
    within(comparison).getByRole("region", { name: "Original" })
  ).toHaveTextContent(evaluation.originalText);
  expect(
    within(comparison).getByRole("region", { name: "Corrected" })
  ).toHaveTextContent(evaluation.correctedText);
  expect(
    within(evidenceLens).getByRole("region", { name: "Findings" })
  ).toHaveTextContent("No errors found.");
  expect(evidenceLens).toHaveTextContent("100");
  expect(evidenceLens).toHaveTextContent("Natural");
  expect(
    within(historyRail).getByRole("link", {
      name: /Previous retained evidence/u,
    })
  ).toHaveAttribute("href", "/evaluations/previous-evaluation");
});

test("learner can inspect a non-error Suggestion", async () => {
  renderEvaluationDetail(evaluation);

  const suggestions = await screen.findByRole("region", {
    name: "Suggestions",
  });

  expect(
    within(suggestions).getByText("This approach could work.")
  ).toBeInTheDocument();
  expect(
    within(suggestions).getByText("This approach might work.")
  ).toBeInTheDocument();
  expect(
    within(suggestions).getByText(
      "The best modal depends on how certain the Learner intends to sound."
    )
  ).toBeInTheDocument();
});

test("finding exposes its original text and Correction as labeled definitions", async () => {
  const detail = {
    ...evaluation,
    correctedText: "I sent the report.",
    findings: [
      {
        category: "Spelling",
        correction: "the",
        explanation: "The letters are reversed.",
        originalText: "teh",
        severity: "Minor",
      },
    ],
    id: "evaluation-with-finding",
    originalText: "I sent teh report.",
    score: 85,
    suggestions: [],
    summary: "One local spelling error.",
  } satisfies Evaluation;

  renderEvaluationDetail(detail);

  const finding = await screen.findByRole("article", {
    name: "Spelling · Minor",
  });

  expect(
    within(finding)
      .getAllByRole("term")
      .map((term) => term.textContent)
  ).toEqual(["Original", "Correction"]);
  expect(
    within(finding)
      .getAllByRole("definition")
      .map((definition) => definition.textContent)
  ).toEqual(["teh", "the"]);
});

test("Evidence Lens shows every Finding, Correction, and Suggestion", async () => {
  const detail = {
    ...evaluation,
    correctedText: "The service depends on the configuration.",
    findings: [
      {
        category: "Article",
        correction: "The service",
        explanation: "The specific service needs an article.",
        originalText: "Service",
        severity: "Moderate",
      },
      {
        category: "Preposition",
        correction: "depends on",
        explanation: "This verb takes the preposition on.",
        originalText: "depends of",
        severity: "Moderate",
      },
    ],
    id: "evaluation-with-complete-evidence",
    originalText: "Service depends of the configuration.",
    score: 70,
    suggestions: [
      ...evaluation.suggestions,
      {
        explanation:
          "A shorter noun depends on whether the component is already known.",
        originalText: "The service",
      },
    ],
    summary: "Two demonstrable errors.",
  } satisfies Evaluation;

  renderEvaluationDetail(detail);

  const evidenceLens = await screen.findByRole("complementary", {
    name: "Feedback",
  });

  expect(
    within(evidenceLens)
      .getAllByRole("article")
      .map((article) => article.getAttribute("aria-labelledby"))
  ).toHaveLength(2);
  expect(evidenceLens).toHaveTextContent("Service");
  expect(evidenceLens).toHaveTextContent("The service");
  expect(evidenceLens).toHaveTextContent("depends of");
  expect(evidenceLens).toHaveTextContent("depends on");
  expect(evidenceLens).toHaveTextContent("This approach might work.");
  expect(evidenceLens).toHaveTextContent(
    "A shorter noun depends on whether the component is already known."
  );
});

test("Original section displays interactive SpellChecker with findings on original text", async () => {
  const detail = {
    ...evaluation,
    correctedText: "I sent the report.",
    findings: [
      {
        category: "Spelling",
        correction: "the",
        explanation: "The letters are reversed.",
        originalText: "teh",
        severity: "Minor",
      },
    ],
    id: "evaluation-with-spellcheck",
    originalText: "I sent teh report.",
    score: 85,
    suggestions: [],
    summary: "One local spelling error.",
  } satisfies Evaluation;

  renderEvaluationDetail(detail);

  const findingTrigger = await screen.findByRole("button", {
    name: "Finding: teh",
  });
  expect(findingTrigger).toBeInTheDocument();
  expect(findingTrigger).toHaveClass("decoration-destructive");

  const user = userEvent.setup();
  await user.click(findingTrigger);

  expect(await screen.findByText("Original:")).toBeInTheDocument();
  expect(
    screen.getAllByText("The letters are reversed.").length
  ).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
});
