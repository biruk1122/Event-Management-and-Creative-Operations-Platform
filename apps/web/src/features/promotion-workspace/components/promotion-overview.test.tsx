import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionWorkspaceRequestError } from "../api/promotion-workspace-gateway";
import { PromotionOverview } from "./promotion-overview";

const gateway = vi.hoisted(() => ({ getPromotionOverview: vi.fn() }));

vi.mock("../api/promotion-workspace-gateway", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../api/promotion-workspace-gateway")
  >()),
  getPromotionOverview: gateway.getPromotionOverview,
}));
// The chart itself is the analytics kit's, tested there; here it is a list.
vi.mock("./promotion-overview-charts", () => ({
  StatusCountChart: (props: {
    title: string;
    rows: { label: string; count: number }[];
  }) => (
    <ul aria-label={props.title}>
      {props.rows.map((row) => (
        <li key={row.label}>
          {row.label}: {row.count}
        </li>
      ))}
    </ul>
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const OVERVIEW = {
  totalCampaigns: 5,
  campaignsByStatus: [
    { status: "ACTIVE", count: 2 },
    { status: "PAUSED", count: 1 },
    { status: "COMPLETED", count: 2 },
  ],
  upcomingEventCount: 3,
  nextEvents: [
    {
      id: "e1",
      name: "Launch night",
      eventType: "CONCERT",
      status: "READY",
      startAt: "2026-12-01T15:00:00.000Z",
      endAt: null,
      location: "Millennium Hall",
      organizerName: null,
      departmentName: "Event Office",
      campaigns: [{ id: "c1", name: "Launch push", status: "ACTIVE" }],
    },
  ],
  partnershipsByStatus: [{ status: "COMMITTED", count: 4 }],
  budget: [
    {
      currency: "ETB",
      allocated: "50000.00",
      approved: "12000.50",
      pending: "800.00",
      campaignCount: 3,
      overBudgetCount: 1,
    },
  ],
  performance: [{ key: "REACH", value: "125000.00", campaignCount: 2 }],
};

describe("PromotionOverview (EVE-234)", () => {
  beforeEach(() => gateway.getPromotionOverview.mockReset());

  it("summarizes campaigns, events, partnerships, budget and indicators", async () => {
    gateway.getPromotionOverview.mockResolvedValue(OVERVIEW);
    const onNavigate = vi.fn();
    render(<PromotionOverview userId="u1" onNavigate={onNavigate} />, {
      wrapper,
    });
    const figure = (label: string) =>
      screen.getByText(label, { selector: "dt" }).nextElementSibling
        ?.textContent;
    expect(await screen.findByText("Campaigns by status")).toBeInTheDocument();
    expect(figure("Campaigns")).toBe("5");
    // Active counts approved, active and paused campaigns.
    expect(figure("Active")).toBe("3");
    expect(figure("Completed")).toBe("2");
    expect(figure("Upcoming events")).toBe("3");
    expect(
      screen.getByRole("list", { name: "Partnerships by status" }),
    ).toHaveTextContent("Committed: 4");
    expect(screen.getByText("ETB 50,000.00")).toBeInTheDocument();
    expect(screen.getByText("ETB 12,000.50")).toBeInTheDocument();
    expect(screen.getByText(/1 over budget/)).toBeInTheDocument();
    expect(screen.getByText("125,000")).toBeInTheDocument();
    expect(
      screen.getByText("No ticketing data available."),
    ).toBeInTheDocument();
    expect(screen.getByText("Launch night")).toBeInTheDocument();
    expect(screen.getByText(/1 promotion campaign$/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "All upcoming events" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("event-promotions");
  });

  it("leaves out what the viewer cannot read instead of showing zero", async () => {
    gateway.getPromotionOverview.mockResolvedValue({
      ...OVERVIEW,
      budget: null,
      partnershipsByStatus: null,
      performance: [],
    });
    render(<PromotionOverview userId="u1" onNavigate={vi.fn()} />, {
      wrapper,
    });
    expect(
      await screen.findByText("Campaign budgets are not shared with you."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Partnerships are not shared with you."),
    ).toBeInTheDocument();
    expect(screen.getByText(/No indicators recorded yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Budget" }),
    ).not.toBeInTheDocument();
  });

  it("shows empty states for a new department", async () => {
    gateway.getPromotionOverview.mockResolvedValue({
      totalCampaigns: 0,
      campaignsByStatus: [],
      upcomingEventCount: 0,
      nextEvents: [],
      partnershipsByStatus: [],
      budget: [],
      performance: [],
    });
    render(<PromotionOverview userId="u1" onNavigate={vi.fn()} />, {
      wrapper,
    });
    expect(
      await screen.findByText("No promotion campaigns yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No partnerships recorded yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No campaign budgets set yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No upcoming events scheduled."),
    ).toBeInTheDocument();
  });

  it("offers a retry when loading fails, and none when access is denied", async () => {
    gateway.getPromotionOverview.mockRejectedValueOnce(
      new PromotionWorkspaceRequestError(500),
    );
    const { unmount } = render(
      <PromotionOverview userId="u1" onNavigate={vi.fn()} />,
      { wrapper },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The Promotion overview could not be loaded.",
    );
    gateway.getPromotionOverview.mockResolvedValueOnce(OVERVIEW);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Launch night")).toBeInTheDocument();
    unmount();

    gateway.getPromotionOverview.mockRejectedValueOnce(
      new PromotionWorkspaceRequestError(403),
    );
    render(<PromotionOverview userId="u2" onNavigate={vi.fn()} />, {
      wrapper,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have access to the Promotion overview.",
    );
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});
