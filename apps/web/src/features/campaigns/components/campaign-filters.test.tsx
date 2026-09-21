import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CampaignFilters } from "./campaign-filters";

function setup(overrides: Partial<Parameters<typeof CampaignFilters>[0]> = {}) {
  const onStatusChange = vi.fn();
  const onTypeChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <CampaignFilters
      status={null}
      campaignType={null}
      search=""
      onStatusChange={onStatusChange}
      onTypeChange={onTypeChange}
      onSearchChange={onSearchChange}
      {...overrides}
    />,
  );
  return { onStatusChange, onTypeChange, onSearchChange };
}

describe("CampaignFilters", () => {
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

  it("offers exactly the campaign lifecycle statuses", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );

    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["All statuses", "Planned", "Active", "Completed", "Cancelled"]);
  });

  it("reports a chosen type and the cleared state", async () => {
    const user = userEvent.setup();
    const { onTypeChange } = setup({ campaignType: "MARKETING" });

    await user.click(screen.getByRole("combobox", { name: "Filter by type" }));
    await user.click(await screen.findByRole("option", { name: "Promotion" }));
    expect(onTypeChange).toHaveBeenCalledWith("PROMOTION");

    await user.click(screen.getByRole("combobox", { name: "Filter by type" }));
    await user.click(await screen.findByRole("option", { name: "All types" }));
    expect(onTypeChange).toHaveBeenCalledWith(null);
  });

  it("reports a search keystroke and shows the current value", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup({ search: "aurora" });

    expect(screen.getByLabelText("Search")).toHaveValue("aurora");
    await user.type(screen.getByLabelText("Search"), "x");
    expect(onSearchChange).toHaveBeenCalledWith("aurorax");
  });
});
