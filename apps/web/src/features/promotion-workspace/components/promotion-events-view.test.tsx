import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionWorkspaceRequestError } from "../api/promotion-workspace-gateway";
import { PromotionEventsView } from "./promotion-events-view";

const gateway = vi.hoisted(() => ({ listUpcomingPromotionEvents: vi.fn() }));

vi.mock("../api/promotion-workspace-gateway", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../api/promotion-workspace-gateway")
  >()),
  listUpcomingPromotionEvents: gateway.listUpcomingPromotionEvents,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LAUNCH = {
  id: "e1",
  name: "Launch night",
  eventType: "CONCERT",
  status: "READY",
  startAt: "2026-12-01T15:00:00.000Z",
  endAt: "2026-12-01T19:00:00.000Z",
  location: "Millennium Hall",
  organizerName: "Lela Events",
  departmentName: "Manager / Event & Office Manager",
  campaigns: [{ id: "c1", name: "Launch push", status: "ACTIVE" }],
};

describe("PromotionEventsView (EVE-234)", () => {
  beforeEach(() => gateway.listUpcomingPromotionEvents.mockReset());

  it("lists upcoming events with dates, location and linked campaigns, read-only", async () => {
    gateway.listUpcomingPromotionEvents.mockResolvedValue([
      LAUNCH,
      { ...LAUNCH, id: "e2", name: "Album tour", campaigns: [] },
    ]);
    render(<PromotionEventsView userId="u1" />, { wrapper });
    expect(await screen.findByText("Launch night")).toBeInTheDocument();
    expect(screen.getAllByText("Millennium Hall")).toHaveLength(2);
    expect(
      screen.getByRole("list", {
        name: "Promotion campaigns for Launch night",
      }),
    ).toHaveTextContent("Launch push · Active");
    expect(
      screen.getByText("No promotion campaign linked yet."),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Dec 1, 2026/).length).toBeGreaterThan(0);
    // Read-only: nothing here edits an event.
    expect(
      screen.queryByRole("button", { name: /edit|delete|create/i }),
    ).not.toBeInTheDocument();
  });

  it("searches by name or location on the server", async () => {
    gateway.listUpcomingPromotionEvents.mockResolvedValue([]);
    render(<PromotionEventsView userId="u1" />, { wrapper });
    expect(
      await screen.findByText("No upcoming events scheduled."),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search"), "Hall");
    await waitFor(() =>
      expect(gateway.listUpcomingPromotionEvents).toHaveBeenLastCalledWith(
        { search: "Hall" },
        expect.anything(),
      ),
    );
    expect(
      await screen.findByText("No upcoming events match this search."),
    ).toBeInTheDocument();
  });

  it("explains a refusal and retries a failure", async () => {
    gateway.listUpcomingPromotionEvents.mockRejectedValueOnce(
      new PromotionWorkspaceRequestError(403),
    );
    render(<PromotionEventsView userId="u1" />, { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to see upcoming events.",
    );
    gateway.listUpcomingPromotionEvents.mockResolvedValueOnce([LAUNCH]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Launch night")).toBeInTheDocument();
  });
});
