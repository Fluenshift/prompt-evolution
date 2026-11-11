import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

describe("Setup & privacy", () => {
  test("keeps setup to essential provider, privacy, data, and access facts", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        setupStatus: {
          configured: false,
          dataLocation: "/data/local.db",
          model: "openai/gpt-5.6-terra",
          provider: "OpenRouter",
          rubricVersion: "1",
        },
      }),
      history: createMemoryHistory({ initialEntries: ["/setup"] }),
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Setup & privacy" })
    ).toBeInTheDocument();

    const provider = screen.getByRole("region", {
      name: "Provider",
    });
    expect(within(provider).getByText("Needs setup")).toBeInTheDocument();
    expect(provider).toHaveTextContent("OpenRouter · openai/gpt-5.6-terra");
    expect(provider).toHaveTextContent(
      "Set OPENROUTER_API_KEY in the server environment, then restart."
    );
    expect(within(provider).queryByRole("button")).not.toBeInTheDocument();
    expect(within(provider).queryByRole("textbox")).not.toBeInTheDocument();

    const facts = screen.getByRole("region", {
      name: "Data and privacy",
    });
    expect(facts).toHaveTextContent(
      "Nothing is sent while you type. Evaluating sends the full sample to OpenRouter."
    );
    expect(facts).toHaveTextContent("Nothing is sent while you type.");
    expect(facts).toHaveTextContent("/data/local.db");
    expect(facts).toHaveTextContent(
      "This app is available on localhost and has no authentication."
    );
    expect(facts).toHaveTextContent("Provider credentials stay on the server.");
    expect(facts).toHaveTextContent(
      "The provider's data policy applies after submission."
    );

    expect(screen.queryByText("Operational boundary")).not.toBeInTheDocument();
    expect(screen.queryByText("Boundary Lens")).not.toBeInTheDocument();
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
    expect(screen.queryByText("Rubric Version")).not.toBeInTheDocument();
  });

  test("reports when the provider is ready", async () => {
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient({
        setupStatus: {
          configured: true,
          dataLocation: "/data/local.db",
          model: "openai/gpt-5.6-terra",
          provider: "OpenRouter",
          rubricVersion: "1",
        },
      }),
      history: createMemoryHistory({ initialEntries: ["/setup"] }),
    });

    render(<RouterProvider router={router} />);

    const provider = await screen.findByRole("region", {
      name: "Provider",
    });
    expect(provider).toHaveTextContent("Ready");
    expect(provider).toHaveTextContent("OpenRouter · openai/gpt-5.6-terra");
    expect(provider).not.toHaveTextContent("then restart");
  });
});
