import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalyticsCharts } from "./analytics-charts";
import { AnalyticsResults } from "./analytics-results";
import type { Responses } from "../lib/analytics-presentation";

const stamp = {
  asOf: "2026-10-12T00:00:00Z",
  freshness: "live-current-state" as const,
};
const period = { from: "2001-09-01", toExclusive: "2001-11-01" };
const month = {
  month: "2001-09",
  tasksCreated: 4,
  eventsCreated: 2,
  projectsCreated: 1,
  productionsCreated: 1,
  campaignsCreated: 2,
  tasksCompleted: 2,
};
const monthly: Responses["monthly"] = {
  ...stamp,
  ...period,
  items: [month, { ...month, month: "2001-10", tasksCreated: 0 }],
};

describe("authoritative analytics visualizations", () => {
  it("keeps task bars exact and marks overdue as overlapping pending", () => {
    render(
      <AnalyticsCharts
        measure="tasks"
        data={{
          ...stamp,
          ...period,
          counts: {
            total: 3,
            completed: 1,
            pending: 2,
            overdue: 1,
            percent: 33,
          },
        }}
      />,
    );
    const figure = screen.getByRole("figure", {
      name: "Task status comparison",
    });
    expect(
      within(figure).getByText(/Overdue tasks are a subset/),
    ).toBeVisible();
    expect(
      within(figure)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([
      "Completed tasks — 1 tasks",
      "Pending tasks — 2 tasks",
      "Overdue tasks — 1 tasks",
    ]);
    expect(figure.querySelectorAll('[style*="width"]')).toHaveLength(3);
  });
  it.each(["departments", "employees", "events", "campaigns"] as const)(
    "shows only the returned %s page without manufacturing a null rate",
    (measure) => {
      render(
        <AnalyticsCharts
          measure={measure}
          data={{
            ...stamp,
            ...period,
            page: 2,
            pageSize: 25,
            total: 100,
            items: [
              {
                id: "allowed-1",
                completed: 1,
                total: 2,
                percent: 50,
                pending: 1,
                overdue: 0,
              },
              {
                id: "empty-2",
                completed: 0,
                total: 0,
                percent: null,
                pending: 0,
                overdue: 0,
              },
            ],
          }}
        />,
      );
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      expect(screen.getByText(/This authorized page only/)).toBeVisible();
      expect(screen.getByText(/No eligible work \(0 \/ 0\)/)).toBeVisible();
      expect(
        screen.getByRole("figure").querySelectorAll('[style*="width"]'),
      ).toHaveLength(1);
      expect(
        screen.getByRole("figure").querySelector('[style*="width"]'),
      ).toHaveStyle({ width: "50%" });
    },
  );
  it("compares returned promotion channels without filling absent channels", () => {
    render(
      <AnalyticsCharts
        measure="promotion"
        data={{
          ...stamp,
          campaignId: "campaign",
          items: [
            { channel: "RADIO_PROMOTION", completed: 1, total: 2, percent: 50 },
          ],
        }}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Channel: radio promotion")).toBeVisible();
    expect(screen.queryByText(/social media/i)).not.toBeInTheDocument();
  });
  it("plots six real monthly series including returned zero buckets and retains table equivalents", () => {
    render(<AnalyticsResults measure="monthly" data={monthly} showCharts />);
    expect(screen.getAllByRole("figure")).toHaveLength(6);
    const graph = screen.getByRole("img", {
      name: "Tasks created: count by UTC month",
    });
    expect(graph).toHaveTextContent("2001-09: 4; 2001-10: 0");
    expect(graph.querySelectorAll("circle")).toHaveLength(2);
    expect(graph.querySelector("polyline")).toHaveAttribute(
      "points",
      "48,40 388,160",
    );
    expect(screen.getByRole("table")).toHaveAccessibleName(
      "Monthly activity — separate source counts",
    );
    expect(
      within(screen.getByRole("table")).getAllByRole("columnheader"),
    ).toHaveLength(7);
  });
  it("does not draw a trend from a single monthly observation", () => {
    render(
      <AnalyticsCharts
        measure="monthly"
        data={{ ...monthly, items: [month] }}
      />,
    );
    for (const graph of screen.getAllByRole("img")) {
      expect(graph.querySelector("polyline")).toBeNull();
      expect(graph.querySelectorAll("circle")).toHaveLength(1);
      expect(graph).toHaveTextContent("One observation; no trend line.");
    }
  });
  it("keeps large monthly counts exact while compacting only display-axis ticks", () => {
    render(
      <AnalyticsCharts
        measure="monthly"
        data={{ ...monthly, items: [{ ...month, tasksCreated: 100000 }] }}
      />,
    );
    const graph = screen.getByRole("img", {
      name: "Tasks created: count by UTC month",
    });
    expect(graph).toHaveTextContent("2001-09: 100000");
    expect(within(graph).getByText("100K")).toBeInTheDocument();
  });
  it("leaves empty task and entity charts absent, not fabricated", () => {
    const { rerender } = render(
      <AnalyticsCharts
        measure="tasks"
        data={{
          ...stamp,
          ...period,
          counts: {
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
            percent: null,
          },
        }}
      />,
    );
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    rerender(
      <AnalyticsCharts
        measure="events"
        data={{ ...stamp, page: 1, pageSize: 25, total: 0, items: [] }}
      />,
    );
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });
  it("does not add charts to consumers that have not opted in", () => {
    render(<AnalyticsResults measure="monthly" data={monthly} />);
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });
});
