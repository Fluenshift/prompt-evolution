import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import Loader from "@/components/loader";

describe("Loader", () => {
  test("announces pending navigation", () => {
    render(<Loader />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});
