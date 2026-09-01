import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("frontend foundation", () => {
  it("identifies the foundation state without exposing business features", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A dependable surface for the work that comes next.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No business features are implemented in this phase."),
    ).toBeInTheDocument();
  });
});
