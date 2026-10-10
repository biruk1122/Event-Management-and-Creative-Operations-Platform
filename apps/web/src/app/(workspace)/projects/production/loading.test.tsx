import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("Production loading state", () => {
  it("announces loading", () => {
    render(<Loading />);
    expect(
      screen.getByRole("status", { name: "Loading production projects" }),
    ).toBeVisible();
  });
});
