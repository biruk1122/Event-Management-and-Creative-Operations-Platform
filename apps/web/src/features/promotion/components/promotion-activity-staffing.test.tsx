import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PromotionActivity } from "../promotion-types";

import { PromotionActivityStaffing } from "./promotion-activity-staffing";

const activity = {
  activity: {
    id: "act-1",
    campaignId: "cmp-1",
    name: "Radio spot",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
  channel: "RADIO_PROMOTION",
  talents: [],
  location: "Bole Road",
  requiredResources: "Van",
  assignees: [
    { id: "u-1", email: "lena@example.com", firstName: "Lena", lastName: null },
  ],
} as unknown as PromotionActivity;

const EMPLOYEES = [
  { id: "u-1", name: "Lena" },
  { id: "u-2", name: "Sami" },
];

function renderStaffing(
  overrides: Partial<Parameters<typeof PromotionActivityStaffing>[0]> = {},
) {
  const props = {
    activity,
    canManage: true,
    employees: EMPLOYEES,
    onSaveDetails: vi.fn(() => Promise.resolve()),
    onAssign: vi.fn(() => Promise.resolve()),
    onUnassign: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<PromotionActivityStaffing {...props} />);
  return props;
}

describe("PromotionActivityStaffing", () => {
  it("shows the location, resources and assigned people", () => {
    renderStaffing();
    expect(screen.getByLabelText("Location")).toHaveValue("Bole Road");
    expect(screen.getByLabelText("Required resources")).toHaveValue("Van");
    expect(screen.getByText("Lena")).toBeInTheDocument();
  });

  it("saves blank text as no value", async () => {
    const user = userEvent.setup();
    const props = renderStaffing();
    await user.clear(screen.getByLabelText("Location"));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(props.onSaveDetails).toHaveBeenCalledWith({
        location: null,
        requiredResources: "Van",
      }),
    );
  });

  it("offers only people not yet assigned, and assigns the one chosen", async () => {
    const user = userEvent.setup();
    const props = renderStaffing();
    const choose = screen.getByLabelText("Add a department member");
    expect(within(choose).queryByText("Lena")).not.toBeInTheDocument();
    await user.selectOptions(choose, "u-2");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(props.onAssign).toHaveBeenCalledWith("u-2"));
  });

  it("removes an assigned person", async () => {
    const user = userEvent.setup();
    const props = renderStaffing();
    await user.click(
      screen.getByRole("button", { name: "Remove Lena from this activity" }),
    );
    await waitFor(() => expect(props.onUnassign).toHaveBeenCalledWith("u-1"));
  });

  it("hides every change from a viewer who may not manage the activity", () => {
    renderStaffing({ canManage: false });
    expect(screen.getByLabelText("Location")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Add a department member"),
    ).not.toBeInTheDocument();
  });
});
