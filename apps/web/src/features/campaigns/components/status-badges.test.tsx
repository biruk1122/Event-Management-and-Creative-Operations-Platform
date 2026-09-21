import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActivityStatusBadge, CampaignStatusBadge } from "./status-badges";

describe("status badges", () => {
  it.each([
    ["PLANNED", "Planned"],
    ["ACTIVE", "Active"],
    ["COMPLETED", "Completed"],
    ["CANCELLED", "Cancelled"],
  ] as const)("names the campaign status %s in text", (status, label) => {
    render(<CampaignStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeVisible();
  });

  it.each([
    ["PLANNED", "Planned"],
    ["IN_PROGRESS", "In progress"],
    ["COMPLETED", "Completed"],
    ["CANCELLED", "Cancelled"],
  ] as const)("names the activity status %s in text", (status, label) => {
    render(<ActivityStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeVisible();
  });

  it("does not use the low-contrast destructive tint for a cancelled status", () => {
    render(
      <>
        <CampaignStatusBadge status="CANCELLED" />
        <ActivityStatusBadge status="CANCELLED" />
      </>,
    );

    for (const badge of screen.getAllByText("Cancelled")) {
      expect(badge.className).not.toContain("bg-destructive");
      expect(badge.className).toContain("text-destructive");
      expect(badge.className).toContain("bg-background");
    }
  });
});
