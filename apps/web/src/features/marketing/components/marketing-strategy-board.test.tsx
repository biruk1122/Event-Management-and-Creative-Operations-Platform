import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeCampaign } from "@/features/campaigns/test-data";

import { MarketingStrategyBoard } from "./marketing-strategy-board";

const campaign = makeCampaign({
  campaignType: "MARKETING",
  name: "Community launch",
  status: "ACTIVE",
  progress: { completedActivities: 1, totalActivities: 2, percent: 50 },
  teams: [{ id: "team-1", name: "Community marketing team" }],
});
const strategy = {
  campaignId: campaign.id,
  strategy: "Partner-led outreach\nAcross regional events",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

const base = { campaign, strategy, state: "ready" as const };

describe("MarketingStrategyBoard", () => {
  it("shows loading, retryable error, denied, empty, and read-only states", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <MarketingStrategyBoard {...base} state="loading" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading marketing strategy",
    );
    rerender(
      <MarketingStrategyBoard {...base} state="error" onRetry={retry} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<MarketingStrategyBoard {...base} state="denied" />);
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    rerender(<MarketingStrategyBoard {...base} strategy={null} />);
    expect(screen.getByText("No strategy yet")).toBeInTheDocument();
    expect(screen.getByText(/Read-only access/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add strategy" })).toBeNull();
  });

  it("shows shared campaign context without duplicating controls", () => {
    render(<MarketingStrategyBoard {...base} />);
    expect(
      screen.getByRole("region", {
        name: "Marketing strategy for Community launch",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /Progress of Community launch/ }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Community marketing team")).toBeInTheDocument();
    expect(screen.getByText(/Partner-led outreach/)).toHaveClass("break-words");
    expect(screen.queryByRole("button", { name: /Assign team/ })).toBeNull();
  });

  it("validates, creates, and announces a strategy with keyboard focus", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MarketingStrategyBoard
        {...base}
        strategy={null}
        canManage
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add strategy" }));
    const field = screen.getByRole("textbox", { name: "Strategy" });
    expect(field).toHaveFocus();
    await user.type(field, "   ");
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a strategy");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, "  Local partners  ");
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Local partners"));
    expect(screen.getByRole("status")).toHaveTextContent("Strategy created.");
    expect(screen.getByRole("button", { name: "Add strategy" })).toHaveFocus();
  });

  it("preserves the draft after failure and restores focus on cancel", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    render(<MarketingStrategyBoard {...base} canManage onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Edit strategy" }));
    const field = screen.getByRole("textbox", { name: "Strategy" });
    expect(field).toHaveValue(strategy.strategy);
    await user.clear(field);
    await user.type(field, "Changed approach");
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(field).toHaveValue("Changed approach");
    expect(field).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save strategy" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Strategy updated.");
    await user.click(screen.getByRole("button", { name: "Edit strategy" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Edit strategy" })).toHaveFocus();
  });

  it("requires confirmation, recovers from removal failure, and retains campaign context", async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    render(<MarketingStrategyBoard {...base} canManage onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove strategy" }));
    expect(
      screen.getByRole("button", { name: "Confirm removal" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Remove strategy" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remove strategy" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent(
      "campaign remains available",
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("disables unconnected actions without implying a save occurred", () => {
    render(<MarketingStrategyBoard {...base} canManage />);
    expect(
      screen.getByRole("button", { name: "Edit strategy" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove strategy" }),
    ).toBeDisabled();
  });
});
