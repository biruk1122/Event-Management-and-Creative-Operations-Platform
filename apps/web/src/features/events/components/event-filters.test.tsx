import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventFilters } from "./event-filters";

function setup(overrides: Partial<Parameters<typeof EventFilters>[0]> = {}) {
  const onStatusChange = vi.fn();
  const onTypeChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <EventFilters
      status={null}
      eventType={null}
      search=""
      onStatusChange={onStatusChange}
      onTypeChange={onTypeChange}
      onSearchChange={onSearchChange}
      {...overrides}
    />,
  );
  return { onStatusChange, onTypeChange, onSearchChange };
}

describe("EventFilters", () => {
  it("reports a chosen status and the cleared state", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = setup({ status: "READY" });

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "In progress" }),
    );
    expect(onStatusChange).toHaveBeenCalledWith("IN_PROGRESS");

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "All statuses" }),
    );
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it("reports a chosen type", async () => {
    const user = userEvent.setup();
    const { onTypeChange } = setup();

    await user.click(screen.getByRole("combobox", { name: "Filter by type" }));
    await user.click(await screen.findByRole("option", { name: "Concert" }));
    expect(onTypeChange).toHaveBeenCalledWith("CONCERT");
  });

  it("reports a search keystroke and shows the current value", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup({ search: "aurora" });

    expect(screen.getByLabelText("Search")).toHaveValue("aurora");
    await user.type(screen.getByLabelText("Search"), "x");
    expect(onSearchChange).toHaveBeenCalledWith("aurorax");
  });
});
