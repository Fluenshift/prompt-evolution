import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type {
  EvaluationFinding,
  EvaluationSuggestion,
} from "./evaluation-client";
import { SpellChecker } from "./spell-checker";

const sampleText = "Explain why the tset fails and how I can fix it.";

const finding: EvaluationFinding = {
  category: "Spelling",
  correction: "test",
  explanation: "The letters are reversed.",
  originalText: "tset",
  severity: "Minor",
};

const suggestion: EvaluationSuggestion = {
  alternative: "how to fix it",
  explanation: "The shorter wording is slightly more direct.",
  originalText: "how I can fix it",
};

describe("SpellChecker", () => {
  test("renders the original text with inline wavy marks for findings and suggestions", () => {
    render(
      <SpellChecker
        findings={[finding]}
        suggestions={[suggestion]}
        text={sampleText}
      />
    );

    expect(screen.getByText("2 issues detected")).toBeInTheDocument();
    expect(screen.getByText("1 error")).toBeInTheDocument();
    expect(screen.getByText("1 suggestion")).toBeInTheDocument();

    const findingTrigger = screen.getByRole("button", {
      name: "Finding: tset",
    });
    expect(findingTrigger).toBeInTheDocument();
    expect(findingTrigger).toHaveClass("decoration-wavy");
    expect(findingTrigger).toHaveClass("decoration-destructive");

    const suggestionTrigger = screen.getByRole("button", {
      name: "Suggestion: how I can fix it",
    });
    expect(suggestionTrigger).toBeInTheDocument();
    expect(suggestionTrigger).toHaveClass("decoration-amber-500");
  });

  test("clicking a finding opens the Grammarly-style popover card", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();

    render(
      <SpellChecker
        findings={[finding]}
        onAccept={onAccept}
        suggestions={[suggestion]}
        text={sampleText}
      />
    );

    const trigger = screen.getByRole("button", { name: "Finding: tset" });
    await user.click(trigger);

    expect(await screen.findByText("Spelling")).toBeInTheDocument();
    expect(screen.getByText("Minor")).toBeInTheDocument();
    expect(screen.getByText("The letters are reversed.")).toBeInTheDocument();
    expect(screen.getByText("Original:")).toBeInTheDocument();

    const acceptButton = screen.getByRole("button", { name: /test/i });
    expect(acceptButton).toBeInTheDocument();

    await user.click(acceptButton);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: "tset",
      })
    );
  });

  test("navigates through issues using toolbar stepper", async () => {
    const user = userEvent.setup();

    render(
      <SpellChecker
        findings={[finding]}
        suggestions={[suggestion]}
        text={sampleText}
      />
    );

    const nextButton = screen.getByRole("button", { name: "Next issue" });
    await user.click(nextButton);

    expect(await screen.findByText("Spelling")).toBeInTheDocument();

    await user.click(nextButton);
    expect(await screen.findByText("Optional wording")).toBeInTheDocument();
  });
});
