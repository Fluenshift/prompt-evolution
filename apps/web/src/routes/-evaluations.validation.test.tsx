import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EvaluationRequestError } from "@/features/evaluations/http-evaluation-client";
import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

describe("Writing Desk validation", () => {
  test("a network failure gives connection guidance without showing private causes", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [
          {
            error: new TypeError("private-network-cause"),
            kind: "failure",
          },
        ],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, "Explain this failure.");
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not reach the server. Check the connection and retry."
    );
    expect(alert).not.toHaveTextContent("private-network-cause");
    expect(input).toHaveValue("Explain this failure.");
  });

  test("a provider timeout explains the delay without discarding the draft", async () => {
    const writingSample = "  Explain this failure.  ";
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The provider took too long. Wait a moment, then retry."
    );
    expect(input).toHaveValue(writingSample);
    expect(
      screen.getByRole("button", { name: "Retry evaluation" })
    ).toBeEnabled();
  });

  test.each([
    [
      "provider-unavailable",
      503,
      "The provider is temporarily unavailable. Wait a moment, then retry.",
    ],
    [
      "forbidden",
      403,
      "The server blocked this request. Reopen the app using its local address.",
    ],
    [
      "configuration-missing",
      503,
      "Provider setup is incomplete. Open setup to continue.",
    ],
    [
      "provider-rate-limited",
      429,
      "The provider is rate-limiting requests. Wait a moment, then retry.",
    ],
    [
      "provider-credits-exhausted",
      402,
      "OpenRouter credits or key budget exhausted. Check balance and key limit.",
    ],
    [
      "provider-rejected",
      502,
      "The provider rejected this request. Check server logs before retrying.",
    ],
    [
      "invalid-assessment",
      502,
      "The provider returned an invalid evaluation. Retry once; if it repeats, check server logs.",
    ],
    [
      "persistence-failure",
      500,
      "The evaluation could not be saved. Check server storage before retrying.",
    ],
    [
      "provider-output-incomplete",
      502,
      "The provider stopped before finishing. Retry once; if it repeats, use a shorter sample.",
    ],
  ])(
    "%s failures show actionable feedback while preserving the draft",
    async (code, status, message) => {
      const writingSample = "Explain this failure.";
      const user = userEvent.setup();
      const router = createAppRouter({
        evaluationClient: createInMemoryEvaluationClient({
          attempts: [
            {
              error: new EvaluationRequestError(
                new Response(null, { status }),
                { code, retryable: status >= 500 }
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
      await user.click(
        screen.getByRole("button", { name: "Evaluate writing" })
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(input).toHaveValue(writingSample);
      expect(input).toHaveAccessibleDescription(/Your text is still here/u);
      expect(
        screen.getByRole("button", { name: "Retry evaluation" })
      ).toBeEnabled();
    }
  );

  test("keeps evaluation disabled until the provider is configured", async () => {
    const evaluateWriting = vi.fn();
    const user = userEvent.setup();
    const baseClient = createInMemoryEvaluationClient({
      setupStatus: {
        configured: false,
        dataLocation: "/data/local.db",
        model: "openai/gpt-5.6-terra",
        provider: "OpenRouter",
        rubricVersion: "1",
      },
    });
    const router = createAppRouter({
      evaluationClient: { ...baseClient, evaluateWriting },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    await user.type(
      await screen.findByLabelText("Writing Sample"),
      "Check this."
    );
    expect(
      screen.getByRole("button", { name: "Evaluate writing" })
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Provider setup required"
    );
    expect(screen.getByRole("link", { name: "Open setup" })).toHaveAttribute(
      "href",
      "/setup"
    );
    expect(evaluateWriting).not.toHaveBeenCalled();
  });

  test("a no-English outcome keeps the exact sample and explains what is required", async () => {
    const writingSample = "  npm --version\n42  ";
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [{ kind: "no-english" }],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add English text before evaluating."
    );
    expect(input).toHaveValue(writingSample);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Add English text/u);
    expect(
      screen.getByRole("button", { name: "Evaluate writing" })
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Writing Desk" })
    ).toBeInTheDocument();
  });

  test("a retryable failure preserves exact writing and can succeed", async () => {
    const writingSample = "  Check this writing without changing spacing.  ";
    const user = userEvent.setup();
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        attempts: [
          { error: new Error("Provider unavailable"), kind: "failure" },
          {
            correctedText: { kind: "submitted-writing" },
            detail: {
              band: "Natural",
              evaluatedAt: "2026-09-01T12:00:00.000Z",
              evaluatedEnglishWordCount: 6,
              findings: [],
              model: "openai/gpt-5.6-terra",
              provider: "OpenRouter",
              rubricVersion: "1",
              score: 100,
              suggestions: [],
              summary: "No errors found.",
            },
            kind: "created",
          },
        ],
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText("Writing Sample");
    await user.type(input, writingSample);
    await user.click(screen.getByRole("button", { name: "Evaluate writing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Evaluation failed. Your text is still here."
    );
    expect(input).toHaveValue(writingSample);
    expect(input).toHaveAccessibleDescription(/Evaluation failed/u);
    expect(
      screen.getByRole("button", { name: "Retry evaluation" })
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Retry evaluation" }));
    expect(
      await screen.findByRole("button", { name: "Evaluate again" })
    ).toBeEnabled();
    expect(input).toHaveValue(writingSample);
  });
});
