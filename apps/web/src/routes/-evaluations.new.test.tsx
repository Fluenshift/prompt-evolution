import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

describe("New Evaluation compatibility route", () => {
  test("redirects old creation links to the Writing Desk", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({ initialEntries: ["/evaluations/new"] }),
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(
      await screen.findByRole("link", { name: "Writing Desk" })
    ).toHaveAttribute("href", "/");
  });

  test("primary navigation exposes permanent product surfaces only", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({ initialEntries: ["/evaluations/new"] }),
    });

    render(<RouterProvider router={router} />);

    const navigation = await screen.findByRole("navigation", {
      name: "Primary navigation",
    });

    expect(navigation).toHaveTextContent("Writing Desk");
    expect(navigation).toHaveTextContent("History");
    expect(navigation).toHaveTextContent("Progress");
    expect(navigation).toHaveTextContent("Setup & privacy");
    expect(
      screen.queryByRole("link", { name: "New Evaluation" })
    ).not.toBeInTheDocument();
  });
});
