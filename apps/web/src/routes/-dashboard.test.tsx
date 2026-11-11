import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type {
  Evaluation,
  EvaluationSubmissionResult,
} from "@/features/evaluations/evaluation-client";
import { EvaluationRequestError } from "@/features/evaluations/http-evaluation-client";
import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

const writingSample = "Explain why the tset fails and how I can fix it.";

const evaluation = {
  band: "Clear",
  correctedText: "Explain why the test fails and how I can fix it.",
  evaluatedAt: "2026-09-01T12:00:00.000Z",
  evaluatedEnglishWordCount: 11,
  findings: [
    {
      category: "Spelling",
      correction: "test",
      explanation: "The letters are reversed.",
      originalText: "tset",
      severity: "Minor",
    },
  ],
  id: "evaluation-001",
  model: "openai/gpt-5.6-terra",
  originalText: writingSample,
  provider: "OpenRouter",
  rubricVersion: "1",
  score: 82,
  suggestions: [
    {
      alternative: "how to fix it",
      explanation: "The shorter wording is slightly more direct.",
      originalText: "how I can fix it",
    },
  ],
  summary: "One spelling correction; meaning remains clear.",
} satisfies Evaluation;

const scenario = {
  correctedText: { kind: "literal", value: evaluation.correctedText },
  detail: {
    band: evaluation.band,
    evaluatedAt: evaluation.evaluatedAt,
    evaluatedEnglishWordCount: evaluation.evaluatedEnglishWordCount,
    findings: evaluation.findings,
    model: evaluation.model,
    provider: evaluation.provider,
    rubricVersion: evaluation.rubricVersion,
    score: evaluation.score,
    suggestions: evaluation.suggestions,
    summary: evaluation.summary,
  },
  kind: "created",
} as const;

describe("Writing Desk", () => {
  test("a later provider failure preserves the changed draft and previous saved evidence", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [
          scenario,
          {
            error: new EvaluationRequestError(
              new Response(null, { status: 504 }),
              { code: "provider-timeout", retryable: true }
            ),
            kind: "failure",
          },
        ],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));
    await screen.findByRole("button", { name: "Evaluate again" });
    await user.type(input, " More context.");
    await user.click(screen.getByRole("button", { name: "Evaluate changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The provider took too long. Wait a moment, then retry."
    );
    expect(input).toHaveValue(`${writingSample} More context.`);
    expect(
      screen.getByText("Draft changed. Evaluate again to update feedback.")
    ).toBeInTheDocument();
    const lens = screen.getByRole("complementary", { name: "Feedback" });
    expect(within(lens).getByText("tset → test")).toBeInTheDocument();
    expect(within(lens).getByText("82")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("complementary", { name: "Recent evaluations" })
      ).getByText(evaluation.summary)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry evaluation" })
    ).toBeEnabled();
  });

  test("is the production root even when an old prototype query remains", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({
        initialEntries: ["/?variant=ultra-compact"],
      }),
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Writing Desk" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Writing Sample")).toHaveValue("");
    expect(screen.getByLabelText("Writing Sample")).toHaveAccessibleDescription(
      /Typing stays local/u
    );
    expect(
      screen.getByRole("button", { name: "Evaluate writing" })
    ).toBeDisabled();
    expect(
      screen.getByRole("complementary", { name: "Feedback" })
    ).toHaveTextContent("Evaluate your sample to see its score");
    const work = screen.getByRole("region", { name: "Writing editor" });
    const lens = screen.getByRole("complementary", { name: "Feedback" });
    const context = screen.getByRole("complementary", {
      name: "Recent evaluations",
    });
    expect(work.compareDocumentPosition(lens)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(lens.compareDocumentPosition(context)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByText("No evaluations yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Interface prototype/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ultra compact/u)).not.toBeInTheDocument();
  });

  test("keeps a completed Evaluation inline with complete evidence", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [scenario],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await user.type(
      await screen.findByLabelText("Writing Sample"),
      writingSample
    );
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    const lens = await screen.findByRole("complementary", {
      name: "Feedback",
    });
    expect(router.state.location.pathname).toBe("/");
    expect(lens).toHaveFocus();
    expect(within(lens).getByText("82")).toBeInTheDocument();
    expect(within(lens).getByText("Clear")).toBeInTheDocument();
    expect(within(lens).getByText("Spelling · Minor")).toBeInTheDocument();
    expect(within(lens).getByText("tset → test")).toBeInTheDocument();
    expect(within(lens).getByText("The letters are reversed.")).toHaveClass(
      "wrap-anywhere"
    );

    await user.click(within(lens).getByRole("button", { name: /corrected/iu }));
    expect(
      within(lens).getByText(evaluation.correctedText)
    ).toBeInTheDocument();

    await user.click(
      within(lens).getByRole("button", { name: /suggestions/iu })
    );
    expect(
      within(lens).getByText("how I can fix it → how to fix it")
    ).toBeInTheDocument();
    expect(
      within(lens).getByText("The shorter wording is slightly more direct.")
    ).toHaveClass("wrap-anywhere");
    expect(
      within(lens).getByRole("link", { name: "Open evaluation" })
    ).toHaveAttribute("href", "/evaluations/evaluation-001");

    const recent = screen.getByRole("complementary", {
      name: "Recent evaluations",
    });
    expect(
      await within(recent).findByText(evaluation.summary)
    ).toBeInTheDocument();
    expect(within(recent).getByText("Finding rate")).toBeInTheDocument();
    expect(within(recent).getByText("9.1 / 100 words")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Progress" }));
    expect(
      await screen.findByRole("region", { name: "Period summary" })
    ).toHaveTextContent("1 evaluation");
  });

  test("pending work preserves exact writing and prevents duplicate submission", async () => {
    const pending = Promise.withResolvers<EvaluationSubmissionResult>();
    const evaluateWriting = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: {
        ...createInMemoryEvaluationClient(),
        evaluateWriting,
      },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const exactWriting = "  Explain this failure.\nKeep spacing.  ";

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, exactWriting);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    expect(input).toHaveValue(exactWriting);
    expect(input).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: "Evaluating writing…" })
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Evaluating writing…");
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        ctrlKey: true,
        key: "Enter",
      })
    );
    expect(evaluateWriting).toHaveBeenCalledTimes(1);

    pending.resolve({
      evaluation: { ...evaluation, originalText: exactWriting },
      kind: "created",
    });
    expect(
      await screen.findByRole("button", { name: "Evaluate again" })
    ).toBeEnabled();
  });

  test("editing after success marks stale evidence without automatic evaluation", async () => {
    const baseClient = createInMemoryEvaluationClient({ attempts: [scenario] });
    const evaluateWriting = vi.fn(baseClient.evaluateWriting);
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: { ...baseClient, evaluateWriting },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));
    await screen.findByRole("button", { name: "Evaluate again" });

    await user.type(input, " More context.");

    expect(
      screen.getByText("Draft changed. Evaluate again to update feedback.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Evaluate changes" })
    ).toBeEnabled();
    expect(screen.getByText("tset → test")).toBeInTheDocument();
    expect(evaluateWriting).toHaveBeenCalledTimes(1);
  });

  test("keyboard submission and repeat submission both remain explicit", async () => {
    const baseClient = createInMemoryEvaluationClient({
      attempts: [scenario, scenario],
    });
    const evaluateWriting = vi.fn(baseClient.evaluateWriting);
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: { ...baseClient, evaluateWriting },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.keyboard("{Control>}{Enter}{/Control}");
    await screen.findByRole("button", { name: "Evaluate again" });
    expect(evaluateWriting).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Evaluate again" }));
    await waitFor(() => expect(evaluateWriting).toHaveBeenCalledTimes(2));
  });

  test("keeps long unbroken Finding and Suggestion evidence reachable", async () => {
    const longFindingExplanation = "finding".repeat(80);
    const longSuggestionExplanation = "suggestion".repeat(80);
    const longEvidenceScenario = {
      ...scenario,
      detail: {
        ...scenario.detail,
        findings: [
          {
            ...scenario.detail.findings[0],
            explanation: longFindingExplanation,
          },
        ],
        suggestions: [
          {
            ...scenario.detail.suggestions[0],
            explanation: longSuggestionExplanation,
          },
        ],
      },
    };
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [longEvidenceScenario],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await user.type(
      await screen.findByLabelText("Writing Sample"),
      writingSample
    );
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    const lens = await screen.findByRole("complementary", {
      name: "Feedback",
    });
    expect(within(lens).getByText(longFindingExplanation)).toHaveClass(
      "wrap-anywhere"
    );

    await user.click(
      within(lens).getByRole("button", { name: /suggestions/iu })
    );
    expect(within(lens).getByText(longSuggestionExplanation)).toHaveClass(
      "wrap-anywhere"
    );
  });

  test("SpellChecker renders findings directly on original text with Grammarly popover and 1-click accept", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [scenario],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    // Verify SpellChecker rendered directly on original text
    const findingTrigger = await screen.findByRole("button", {
      name: "Finding: tset",
    });
    expect(findingTrigger).toBeInTheDocument();
    expect(findingTrigger).toHaveClass("decoration-wavy");
    expect(findingTrigger).toHaveClass("decoration-destructive");

    // Click finding on text to open the Grammarly card
    await user.click(findingTrigger);

    expect(await screen.findByText("Original:")).toBeInTheDocument();
    expect(screen.getAllByText("Spelling").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("The letters are reversed.").length
    ).toBeGreaterThanOrEqual(2);

    // Click Accept button on the popover to apply correction to the draft
    const acceptButton = screen.getByRole("button", { name: /accept/i });
    await user.click(acceptButton);

    // Verify draft textarea was updated with the correction
    expect(input).toHaveValue("Explain why the test fails and how I can fix it.");
    expect(
      screen.getByText("Draft changed. Evaluate again to update feedback.")
    ).toBeInTheDocument();
  });
});
