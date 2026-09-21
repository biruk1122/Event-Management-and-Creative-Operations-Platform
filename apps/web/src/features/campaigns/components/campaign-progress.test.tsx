import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CampaignProgress } from "./campaign-progress";

describe("CampaignProgress", () => {
  it("exposes the value to assistive tech and shows the figures as text", () => {
    render(
      <CampaignProgress
        progress={{ completedActivities: 3, totalActivities: 8, percent: 38 }}
        label="Progress of Aurora"
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Progress of Aurora" });
    expect(bar).toHaveAttribute("aria-valuenow", "38");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "3 of 8 activities · 38%");
    expect(screen.getByText("3 of 8 activities · 38%")).toBeVisible();
  });

  it("shows a full bar at 100 percent", () => {
    render(
      <CampaignProgress
        progress={{ completedActivities: 2, totalActivities: 2, percent: 100 }}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("states that nothing counts yet instead of an empty bar", () => {
    render(
      <CampaignProgress
        progress={{ completedActivities: 0, totalActivities: 0, percent: null }}
      />,
    );

    expect(screen.getByText("No activities counted yet")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
