import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageLoading } from "./page-loading";

describe("PageLoading", () => {
  it("shows the page heading and a status message while the route loads", () => {
    render(<PageLoading title="Leave" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Leave" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading leave…");
  });
});
