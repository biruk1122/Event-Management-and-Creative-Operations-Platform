import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardResults } from "./dashboard-results";
import type { DashboardCard } from "../lib/dashboard-presentation";

function ready(data: unknown): DashboardCard {
  return {
    state: "ready",
    scope: "organization",
    asOf: "2026-10-07T12:00:00Z",
    data,
  } as DashboardCard;
}

describe("DashboardResults charts", () => {
  it("renders a labelled bar chart above the unchanged comparison table", () => {
    render(
      <DashboardResults
        cardKey="eventProgress"
        card={ready({
          asOf: "2026-10-07T12:00:00Z",
          freshness: "live-current-state",
          page: 1,
          pageSize: 25,
          total: 1,
          items: [
            {
              id: "event-1",
              completed: 4,
              total: 8,
              percent: 50,
              pending: 3,
              overdue: 1,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Event progress comparison" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Subject ID" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "event-1" }),
    ).toBeInTheDocument();
  });

  it("renders no chart when a progress measure has no eligible items", () => {
    render(
      <DashboardResults
        cardKey="eventProgress"
        card={ready({
          asOf: "2026-10-07T12:00:00Z",
          freshness: "live-current-state",
          page: 1,
          pageSize: 25,
          total: 0,
          items: [],
        })}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/No matching data/)).toBeInTheDocument();
  });

  it("shows a budget comparison bar only when a planned amount is set, never a fabricated baseline", () => {
    render(
      <DashboardResults
        cardKey="budgetPlannedVsApproved"
        card={ready({
          hasMore: false,
          items: [
            {
              eventId: "event-1",
              eventName: "Launch film",
              plannedAmount: "15000.00",
              currency: "USD",
              actualApproved: "9800.00",
              actualPending: "1350.00",
            },
            {
              eventId: "event-2",
              eventName: "No budget set yet",
              plannedAmount: null,
              currency: null,
              actualApproved: "0.00",
              actualPending: "0.00",
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "Budget: planned 15000.00, approved 9800.00, pending 1350.00",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not set/)).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
