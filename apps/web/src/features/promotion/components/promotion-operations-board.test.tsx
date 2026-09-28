import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeActivity } from "@/features/campaigns/test-data";
import type { PromotionActivity } from "../promotion-types";
import { PromotionOperationsBoard } from "./promotion-operations-board";

const radio = makeActivity({ id: "radio", name: "Radio spot" });
const social = makeActivity({
  id: "social",
  name: "Social launch",
  status: "IN_PROGRESS",
});
const detail: PromotionActivity = {
  activity: radio,
  channel: "RADIO_PROMOTION",
  talents: [
    {
      id: "assignment-1",
      talentId: "talent-1",
      role: "Host",
      createdAt: "2026-09-01T00:00:00Z",
    },
  ],
};

const base = {
  campaignName: "Album launch",
  activities: [radio, social],
  promotionActivities: [detail],
  state: "ready" as const,
};

describe("PromotionOperationsBoard", () => {
  it("shows loading, retryable error, denied, and no-activity states", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <PromotionOperationsBoard {...base} state="loading" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading promotion activities",
    );
    rerender(
      <PromotionOperationsBoard {...base} state="error" onRetry={retry} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<PromotionOperationsBoard {...base} state="denied" />);
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    rerender(
      <PromotionOperationsBoard
        {...base}
        activities={[]}
        promotionActivities={[]}
      />,
    );
    expect(screen.getByText(/No campaign activities yet/)).toBeInTheDocument();
  });

  it("filters activities and adds a channel to an unconfigured activity", async () => {
    const user = userEvent.setup();
    const attach = vi.fn().mockResolvedValue(undefined);
    render(<PromotionOperationsBoard {...base} canManage onAttach={attach} />);
    await user.selectOptions(screen.getByLabelText("Channel"), "UNCONFIGURED");
    expect(
      screen.queryByRole("button", { name: /Radio spot/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Social launch/ }));
    await user.selectOptions(
      screen.getByLabelText("Delivery channel"),
      "SOCIAL_MEDIA",
    );
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    await waitFor(() =>
      expect(attach).toHaveBeenCalledWith("social", "SOCIAL_MEDIA"),
    );
    expect(
      await screen.findByText("Promotion channel added."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search activities"), "absent");
    expect(
      screen.getByText("No activities match these filters."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("button", { name: /Radio spot/ }),
    ).toBeInTheDocument();
  });

  it("changes channels, assigns talent, and confirms destructive removal", async () => {
    const user = userEvent.setup();
    const change = vi.fn().mockResolvedValue(undefined);
    const assign = vi.fn().mockResolvedValue(undefined);
    const unassign = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    render(
      <PromotionOperationsBoard
        {...base}
        canManage
        canAssignTalent
        availableTalents={[
          { id: "talent-1", name: "Mira" },
          { id: "talent-2", name: "Sena" },
        ]}
        onChangeChannel={change}
        onAssignTalent={assign}
        onUnassignTalent={unassign}
        onRemove={remove}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Radio spot/ }));
    expect(screen.getByText("Mira · Host")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Delivery channel"),
      "TELEVISION",
    );
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("radio", "TELEVISION"),
    );
    await user.selectOptions(screen.getByLabelText("Talent"), "talent-2");
    await user.type(screen.getByLabelText("Role"), "  Singer  ");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("radio", "talent-2", "Singer"),
    );
    const assignment = screen.getByText("Mira · Host").closest("li")!;
    await user.click(
      within(assignment).getByRole("button", { name: "Remove talent" }),
    );
    await waitFor(() =>
      expect(unassign).toHaveBeenCalledWith("radio", "talent-1"),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove promotion detail" }),
    );
    const confirm = screen.getByRole("button", { name: "Confirm removal" });
    expect(document.activeElement).toBe(confirm);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Remove promotion detail" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("radio"));
    expect(
      await screen.findByText("Promotion detail removed."),
    ).toBeInTheDocument();
  });

  it("keeps unsaved input after failure and disables unavailable actions", async () => {
    const user = userEvent.setup();
    const attach = vi.fn().mockRejectedValue(new Error("network"));
    const { rerender } = render(
      <PromotionOperationsBoard
        {...base}
        canManage
        onAttach={attach}
        canAssignTalent
        talentsUnavailable
      />,
    );
    await user.click(screen.getByRole("button", { name: /Social launch/ }));
    await user.selectOptions(
      screen.getByLabelText("Delivery channel"),
      "ADVERTISING",
    );
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByLabelText("Delivery channel")).toHaveValue(
      "ADVERTISING",
    );
    rerender(
      <PromotionOperationsBoard
        {...base}
        canManage
        canAssignTalent
        talentsUnavailable
      />,
    );
    expect(screen.getByRole("button", { name: "Add channel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Radio spot/ }));
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
    expect(
      screen.getByText(/Talent choices are unavailable/),
    ).toBeInTheDocument();
  });

  it("keeps read-only activity details visible without mutation controls", async () => {
    const user = userEvent.setup();
    render(<PromotionOperationsBoard {...base} />);
    await user.click(screen.getByRole("button", { name: /Radio spot/ }));
    expect(screen.getByText("Talent · Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery channel")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save channel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove promotion detail" }),
    ).not.toBeInTheDocument();
  });
});
