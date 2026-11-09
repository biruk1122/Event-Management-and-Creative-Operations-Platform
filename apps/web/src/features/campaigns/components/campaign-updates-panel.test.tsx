import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CampaignUpdate } from "../api/campaign-detail-gateway";

import { CampaignUpdatesPanel } from "./campaign-updates-panel";

const entry: CampaignUpdate = {
  id: "u1",
  campaignId: "cmp-1",
  note: "Venue confirmed for Friday.",
  author: {
    id: "a1",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
  createdAt: "2026-11-01T10:00:00.000Z",
};

describe("CampaignUpdatesPanel", () => {
  it("lists entries with their author and says the log cannot be edited", async () => {
    render(
      <CampaignUpdatesPanel
        campaignId="cmp-1"
        canWrite={false}
        list={() => Promise.resolve([entry])}
        add={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("Venue confirmed for Friday."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Dana Okafor/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited or removed/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add update" }),
    ).not.toBeInTheDocument();
  });

  it("adds an entry to the top of the log", async () => {
    const user = userEvent.setup();
    const add = vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        value: { ...entry, id: "u2", note: "Flyers printed." },
      }),
    );
    render(
      <CampaignUpdatesPanel
        campaignId="cmp-1"
        canWrite
        list={() => Promise.resolve([entry])}
        add={add}
      />,
    );
    await screen.findByText("Venue confirmed for Friday.");
    await user.type(
      screen.getByLabelText("Add an update"),
      "  Flyers printed.  ",
    );
    await user.click(screen.getByRole("button", { name: "Add update" }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith("cmp-1", "Flyers printed."),
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Flyers printed.");
  });

  it("refuses a blank entry without calling the server", async () => {
    const user = userEvent.setup();
    const add = vi.fn();
    render(
      <CampaignUpdatesPanel
        campaignId="cmp-1"
        canWrite
        list={() => Promise.resolve([])}
        add={add}
      />,
    );
    await screen.findByText("No updates yet.");
    await user.type(screen.getByLabelText("Add an update"), "   ");
    await user.click(screen.getByRole("button", { name: "Add update" }));
    expect(
      await screen.findByText("Write the update before adding it."),
    ).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });
});
