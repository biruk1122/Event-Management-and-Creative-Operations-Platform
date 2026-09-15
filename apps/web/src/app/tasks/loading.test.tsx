import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("Tasks loading state", () => {
  it("announces task loading with responsive placeholder cards", () => {
    render(<Loading />);
    const status = screen.getByRole("status", { name: "Loading tasks" });
    expect(status).toBeVisible();
    expect(status.children).toHaveLength(4);
    expect(status.className).toContain("sm:grid-cols-2");
  });
});
