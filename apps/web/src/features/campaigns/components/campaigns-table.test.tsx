import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeCampaign } from "../test-data";
import { CampaignsTable } from "./campaigns-table";

const CAMPAIGNS = [
  makeCampaign({
    id: "c1",
    name: "Aurora Awareness",
    status: "ACTIVE",
    manager: {
      id: "u1",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    progress: { completedActivities: 1, totalActivities: 4, percent: 25 },
  }),
  makeCampaign({
    id: "c2",
    name: "Orbit Launch",
    campaignType: "MARKETING",
    status: "PLANNED",
  }),
];

function setup(overrides: Partial<Parameters<typeof CampaignsTable>[0]> = {}) {
  const onSelect = vi.fn();
  const onPageChange = vi.fn();
  render(
    <CampaignsTable
      campaigns={CAMPAIGNS}
      onSelect={onSelect}
      page={1}
      pageCount={1}
      onPageChange={onPageChange}
      filtered={false}
      {...overrides}
    />,
  );
  return { onSelect, onPageChange };
}

describe("CampaignsTable", () => {
  it("renders a row per campaign with its type, status, progress, and manager", () => {
    setup();

    const table = screen.getByRole("table");
    const aurora = within(table).getByRole("row", { name: /Aurora Awareness/ });
    expect(within(aurora).getByText("Promotion")).toBeVisible();
    expect(within(aurora).getByText("Active")).toBeVisible();
    expect(within(aurora).getByText("Morgan Lead")).toBeVisible();
    expect(
      within(aurora).getByRole("progressbar", {
        name: "Progress of Aurora Awareness",
      }),
    ).toHaveAttribute("aria-valuenow", "25");

    const orbit = within(table).getByRole("row", { name: /Orbit Launch/ });
    expect(within(orbit).getByText("Unassigned")).toBeVisible();
    expect(within(orbit).getByText("No activities counted yet")).toBeVisible();
  });

  it("gives every column a header", () => {
    setup();

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Type", "Status", "Progress", "Schedule", "Manager"]);
  });

  it("selects a campaign from its name", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: "Orbit Launch",
      }),
    );

    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("explains an empty list and points to the create action", () => {
    setup({ campaigns: [] });

    expect(screen.getByText("No campaigns yet")).toBeVisible();
    expect(screen.getByText(/New campaign button/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains an empty filtered list and how to recover", () => {
    setup({ campaigns: [], filtered: true });

    expect(screen.getByText("No campaigns match these filters")).toBeVisible();
    expect(
      screen.getByText("Clear the filters or adjust your search."),
    ).toBeVisible();
  });

  it("hides pagination for a single page", () => {
    setup();

    expect(
      screen.queryByRole("navigation", { name: "Campaigns pagination" }),
    ).not.toBeInTheDocument();
  });

  it("pages forward and back, disabling the ends", async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ page: 1, pageCount: 3 });
    const nav = screen.getByRole("navigation", {
      name: "Campaigns pagination",
    });

    expect(within(nav).getByText("Page 1 of 3")).toBeVisible();
    expect(
      within(nav).getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await user.click(within(nav).getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables Next on the last page", () => {
    setup({ page: 3, pageCount: 3 });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });
});
