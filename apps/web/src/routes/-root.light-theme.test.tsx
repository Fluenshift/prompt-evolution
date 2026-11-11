import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createInMemoryEvaluationClient } from "@/features/evaluations/in-memory-evaluation-client";
import { createAppRouter } from "@/router";

describe("light-only application shell", () => {
  afterEach(() => {
    toast.dismiss();
    vi.restoreAllMocks();
  });

  test("does not read or write a stored theme", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const readStorage = vi.spyOn(Storage.prototype, "getItem");
    const writeStorage = vi.spyOn(Storage.prototype, "setItem");
    const router = createAppRouter({
      evaluationClient: createInMemoryEvaluationClient(),
      history: createMemoryHistory({ initialEntries: ["/evaluations/new"] }),
    });

    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: "Writing Desk" });
    expect(readStorage).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();

    toast("Theme probe");
    await screen.findByText("Theme probe");
    expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      "light"
    );
  });
});
