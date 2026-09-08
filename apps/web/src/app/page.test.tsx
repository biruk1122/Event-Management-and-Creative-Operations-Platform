import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";
vi.mock("@/features/rbac/components/roles-navigation", () => ({
  RolesNavigation: () => null,
}));
vi.mock("@/features/users", () => ({ UsersNavigation: () => null }));
vi.mock("@/features/departments", () => ({
  DepartmentsNavigation: () => null,
}));

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
