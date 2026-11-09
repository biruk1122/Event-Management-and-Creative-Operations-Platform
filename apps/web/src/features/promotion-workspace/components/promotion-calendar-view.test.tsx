import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionCalendarView } from "./promotion-calendar-view";

const api = vi.hoisted(() => ({
  listUpcomingPromotionEvents: vi.fn(),
  listAllPromotionActivities: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock("../api/promotion-workspace-gateway", () => ({
  listUpcomingPromotionEvents: api.listUpcomingPromotionEvents,
}));
vi.mock("@/features/promotion/api/promotion-gateway", () => ({
  listAllPromotionActivities: api.listAllPromotionActivities,
}));
vi.mock("@/features/tasks/api/tasks-gateway", () => ({
  listTasks: api.listTasks,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ALL = { events: true, activities: true, deadlines: true };

describe("PromotionCalendarView (EVE-234)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T09:00:00.000Z"));
    api.listUpcomingPromotionEvents.mockResolvedValue([
      {
        id: "e1",
        name: "Launch night",
        startAt: "2026-11-20T15:00:00.000Z",
        location: "Millennium Hall",
        departmentName: "Event Office",
        campaigns: [],
      },
    ]);
    api.listAllPromotionActivities.mockResolvedValue({
      items: [
        {
          activity: {
            id: "a1",
            name: "Flyer run",
            status: "PLANNED",
            startAt: "2026-11-12T07:00:00.000Z",
          },
          campaignName: "Launch push",
          location: "Bole",
        },
      ],
      total: 1,
    });
    api.listTasks.mockResolvedValue({
      items: [
        {
          id: "t1",
          title: "Print posters",
          status: "IN_PROGRESS",
          dueAt: "2026-11-12T12:00:00.000Z",
        },
        // Outside the month: not shown.
        {
          id: "t2",
          title: "Old task",
          status: "COMPLETED",
          dueAt: "2026-10-01T12:00:00.000Z",
        },
      ],
      total: 2,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("puts events, activities and task deadlines on the month grid", async () => {
    render(
      <PromotionCalendarView userId="u1" sources={ALL} departmentId="dept" />,
      { wrapper },
    );
    const grid = await screen.findByRole("table");
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(within(grid).getByText("Launch night")).toBeInTheDocument();
    expect(within(grid).getByText("Flyer run")).toBeInTheDocument();
    expect(within(grid).getByText("Print posters")).toBeInTheDocument();
    expect(within(grid).queryByText("Old task")).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept", sort: "DUE_AT" }),
      expect.anything(),
    );
    expect(api.listUpcomingPromotionEvents).toHaveBeenCalledWith(
      {
        from: "2026-10-31T21:00:00.000Z",
        to: "2026-11-30T20:59:59.999Z",
      },
      expect.anything(),
    );
    expect(grid.querySelector('[aria-current="date"]')).toHaveTextContent("9");
  });

  it("lists the month by day and moves between months", async () => {
    render(
      <PromotionCalendarView userId="u1" sources={ALL} departmentId="dept" />,
      { wrapper },
    );
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "List" }));
    const day = screen.getByRole("region", {
      name: "Thursday, November 12, 2026",
    });
    expect(within(day).getByText("Flyer run")).toBeInTheDocument();
    expect(within(day).getByText(/Task deadline/)).toBeInTheDocument();

    // The server filters events and activities by the month asked for.
    api.listUpcomingPromotionEvents.mockResolvedValue([]);
    api.listAllPromotionActivities.mockResolvedValue({ items: [], total: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("December 2026")).toBeInTheDocument();
    expect(
      await screen.findByText("Nothing scheduled in December 2026."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
  });

  it("reads only the sources the viewer may see", async () => {
    render(
      <PromotionCalendarView
        userId="u1"
        sources={{ events: false, activities: false, deadlines: true }}
        departmentId="dept"
      />,
      { wrapper },
    );
    expect(await screen.findByText("Print posters")).toBeInTheDocument();
    expect(api.listUpcomingPromotionEvents).not.toHaveBeenCalled();
    expect(api.listAllPromotionActivities).not.toHaveBeenCalled();
  });

  it("says which source failed and keeps the rest", async () => {
    api.listAllPromotionActivities.mockRejectedValue(new Error("down"));
    render(
      <PromotionCalendarView userId="u1" sources={ALL} departmentId="dept" />,
      { wrapper },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some activities could not be loaded.",
    );
    expect(screen.getByText("Launch night")).toBeInTheDocument();
  });
});
