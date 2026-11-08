import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => ({
  listAll: vi.fn(),
}));

vi.mock(
  "@/features/promotion/api/promotion-gateway",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/promotion/api/promotion-gateway")
      >();
    return { ...actual, listAllPromotionActivities: gateway.listAll };
  },
);

import { PromotionActivitiesView } from "./promotion-activities-view";

const row = (
  id: string,
  name: string,
  startAt: string | null,
  campaign = "Launch",
) => ({
  activity: { id, name, status: "PLANNED", startAt },
  channel: "RADIO_PROMOTION",
  campaignId: "cmp-1",
  campaignName: campaign,
  location: "Bole Road",
});

describe("PromotionActivitiesView", () => {
  it("lists activities with their campaign, channel and location", async () => {
    gateway.listAll.mockResolvedValueOnce({
      items: [row("a1", "Radio spot", null)],
      total: 1,
    });
    render(<PromotionActivitiesView mode="list" />);
    expect(await screen.findByText("Radio spot")).toBeInTheDocument();
    expect(
      screen.getByText(/Launch · Radio promotion · Bole Road/),
    ).toBeInTheDocument();
  });

  it("groups by start day in the calendar, with undated activities last", async () => {
    gateway.listAll.mockResolvedValueOnce({
      items: [
        row("a1", "Late show", "2026-11-20T10:00:00.000Z"),
        row("a2", "Early show", "2026-11-10T10:00:00.000Z"),
        row("a3", "Undated", null),
      ],
      total: 3,
    });
    render(<PromotionActivitiesView mode="calendar" />);
    await screen.findByText("Early show");
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings[headings.length - 1]).toBe("No date yet");
    expect(headings.length).toBe(3);
  });

  it("shows an empty state when nothing matches", async () => {
    gateway.listAll.mockResolvedValueOnce({ items: [], total: 0 });
    render(<PromotionActivitiesView mode="list" />);
    expect(
      await screen.findByText(
        "No promotional activities match these filters yet.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a refusal and asks the viewer to try again on other failures", async () => {
    gateway.listAll.mockRejectedValueOnce(new Error("down"));
    render(<PromotionActivitiesView mode="list" />);
    expect(
      await screen.findByText("Promotional activities could not be loaded."),
    ).toBeInTheDocument();
    await waitFor(() => expect(gateway.listAll).toHaveBeenCalled());
  });
});
