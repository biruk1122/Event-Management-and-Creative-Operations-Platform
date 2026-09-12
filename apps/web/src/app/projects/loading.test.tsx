import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("Projects loading state", () => {
  it("announces a loading status with placeholder rows", () => {
    render(<Loading />);
    const status = screen.getByRole("status", { name: "Loading projects" });
    expect(status).toBeVisible();
    expect(status.children).toHaveLength(6);
  });
});
