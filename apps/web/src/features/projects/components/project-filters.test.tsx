import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectFilters } from "./project-filters";

function setup(overrides: Partial<Parameters<typeof ProjectFilters>[0]> = {}) {
  const onStatusChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <ProjectFilters
      status={null}
      search=""
      onStatusChange={onStatusChange}
      onSearchChange={onSearchChange}
      {...overrides}
    />,
  );
  return { onStatusChange, onSearchChange };
}

describe("ProjectFilters", () => {
  it("reports a chosen status and the cleared state", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = setup({ status: "ACTIVE" });

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Completed" }));
    expect(onStatusChange).toHaveBeenCalledWith("COMPLETED");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "All statuses" }),
    );
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it("reports a search keystroke and shows the current value", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup({ search: "brand" });

    expect(screen.getByLabelText("Search")).toHaveValue("brand");
    await user.type(screen.getByLabelText("Search"), "x");
    expect(onSearchChange).toHaveBeenCalledWith("brandx");
  });
});
