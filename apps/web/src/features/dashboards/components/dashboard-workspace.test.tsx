import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardWorkspace } from "./dashboard-workspace";
import {
  managementCards,
  employeeCards,
  visibleCards,
  type DashboardAccess,
} from "../lib/dashboard-presentation";

const access = (
  permissions: [string, DashboardAccess["grants"][number]["scope"]][],
): DashboardAccess => ({
  userId: "actor",
  grants: permissions.map(([permissionKey, scope]) => ({
    permissionKey,
    scope,
  })),
});
const employee = access([
  ["dashboard.read", "SELF"],
  ["task.read", "SELF"],
  ["todo.read", "SELF"],
]);
const management = access([
  ["dashboard.management.read", "MANAGEMENT"],
  ["task.read", "ORGANIZATION"],
  ["analytics.management.read", "MANAGEMENT"],
]);
describe("dashboard presentation", () => {
  it("contains every approved management and employee card", () => {
    expect(managementCards).toHaveLength(23);
    expect(employeeCards).toHaveLength(7);
    expect(
      new Set([...managementCards, ...employeeCards].map((card) => card.key))
        .size,
    ).toBe(30);
  });
  it("requires entry and source scopes, not role names", () => {
    expect(
      visibleCards(access([["task.read", "ORGANIZATION"]]), "management"),
    ).toEqual([]);
    const limited = access([
      ["dashboard.management.read", "MANAGEMENT"],
      ["task.read", "DEPARTMENT"],
    ]);
    expect(visibleCards(limited, "management").map((card) => card.key)).toEqual(
      ["todayDeadlines", "attentionTasks"],
    );
  });
  it("shows honest disconnected state, never fixture counts", () => {
    render(<DashboardWorkspace access={employee} audience="employee" />);
    expect(screen.getByRole("status")).toHaveTextContent("not connected");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Export dashboard" }),
    ).toHaveAccessibleDescription(/does not provide exports/);
  });
  it("uses campaign permission for overdue campaign activities", () => {
    const campaignAccess = access([
      ["dashboard.management.read", "MANAGEMENT"],
      ["campaign.read", "ORGANIZATION"],
    ]);
    expect(
      visibleCards(campaignAccess, "management").map((card) => card.key),
    ).toContain("overdueActivities");
    expect(
      visibleCards(management, "management").map((card) => card.key),
    ).not.toContain("overdueActivities");
  });
  it("retries partial cards from the actual source-level timeout shape", async () => {
    const retry = vi.fn();
    render(
      <DashboardWorkspace
        access={employee}
        audience="employee"
        onRetry={retry}
        panels={{
          myUpcomingDeadlines: {
            state: "partial",
            sources: {
              tasks: { state: "unavailable", retryable: true },
              todos: { state: "ready" },
            },
            data: { items: [], hasMore: false },
          },
        }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry my upcoming deadlines" }),
    );
    expect(retry).toHaveBeenCalledWith("myUpcomingDeadlines");
  });
  it("distinguishes ready zero from empty lists and failures", () => {
    render(
      <DashboardWorkspace
        access={management}
        audience="management"
        panels={{
          pendingTasks: { state: "ready", data: { count: 0 } },
          completedTasks: { state: "unavailable", retryable: false },
          attentionTasks: {
            state: "empty",
            data: { items: [], hasMore: false },
          },
        }}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No matching items.")).toBeInTheDocument();
    expect(
      screen.getByText("Retry is not available for this failure."),
    ).toBeInTheDocument();
  });
  it("removes denied cards including stale titles, payloads and links", () => {
    render(
      <DashboardWorkspace
        access={employee}
        audience="employee"
        panels={{ myTasks: { state: "denied", data: { count: 99 } } }}
      />,
    );
    expect(
      screen.queryByRole("heading", { name: "My tasks" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });
  it.each(["checking", "error", "signedOut"] as const)(
    "hides protected panels while access is %s",
    (accessStatus) => {
      render(
        <DashboardWorkspace
          access={employee}
          audience="employee"
          accessStatus={accessStatus}
          panels={{ myTasks: { state: "ready", data: { count: 99 } } }}
        />,
      );
      expect(screen.queryByText("99")).not.toBeInTheDocument();
    },
  );
  it("immediately hides cards when source grants are revoked", () => {
    const { rerender } = render(
      <DashboardWorkspace
        access={employee}
        audience="employee"
        panels={{ myTasks: { state: "ready", data: { count: 99 } } }}
      />,
    );
    rerender(
      <DashboardWorkspace
        access={access([["dashboard.read", "SELF"]])}
        audience="employee"
        panels={{ myTasks: { state: "ready", data: { count: 99 } } }}
      />,
    );
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.getByText(/No dashboard cards/)).toBeInTheDocument();
  });
  it("keeps sibling cards usable while retrying a failure", async () => {
    const retry = vi.fn();
    render(
      <DashboardWorkspace
        access={employee}
        audience="employee"
        onRetry={retry}
        panels={{
          myTasks: {
            state: "unavailable",
            retryable: true,
            requestId: "ref-1",
          },
          myTodo: {
            state: "ready",
            data: {
              items: [
                {
                  id: "a",
                  kind: "TODO",
                  title: "Prepare brief",
                  dueDate: "2026-10-07",
                  dueTime: "09:00",
                },
              ],
              hasMore: true,
            },
          },
        }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry my tasks" }),
    );
    expect(retry).toHaveBeenCalledWith("myTasks");
    expect(screen.getByText("Prepare brief")).toBeInTheDocument();
    expect(screen.getByText(/floating date\/time/)).toBeInTheDocument();
    expect(screen.getByText(/More items available/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open my to-do workspace" }),
    ).toHaveAttribute("href", "/todos");
  });
  it("labels source failures without revealing denied sources", () => {
    render(
      <DashboardWorkspace
        access={employee}
        audience="employee"
        staleKeys={["myUpcomingDeadlines"]}
        panels={{
          myUpcomingDeadlines: {
            state: "partial",
            scope: "self",
            asOf: "2026-10-07T12:00:00Z",
            sources: {
              tasks: { state: "unavailable", retryable: true },
              projects: { state: "denied" },
              todos: { state: "ready" },
            },
            data: {
              items: [{ id: "a", title: "Allowed task", kind: "TASK" }],
              hasMore: false,
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Allowed task")).toBeInTheDocument();
    expect(screen.getByText(/Stale:/)).toBeInTheDocument();
    expect(screen.queryByText(/projects:/)).not.toBeInTheDocument();
    expect(screen.getByText(/tasks: unavailable/)).toBeInTheDocument();
  });
  it("offers loading, selection and successful refresh notices", () => {
    render(
      <DashboardWorkspace
        access={management}
        audience="management"
        notice="Dashboard refreshed successfully."
        panels={{
          pendingTasks: { state: "loading" },
          promotionPerformance: { state: "selectionRequired" },
        }}
      />,
    );
    expect(screen.getByText("Loading pending tasks…")).toBeInTheDocument();
    expect(
      screen.getByText(/Choose a promotion campaign above/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dashboard refreshed successfully."),
    ).toHaveAttribute("role", "status");
  });
  it("supports keyboard filter submission and validates campaign IDs", async () => {
    const apply = vi.fn();
    const user = userEvent.setup();
    render(
      <DashboardWorkspace
        access={management}
        audience="management"
        day="2026-10-07"
        onApply={apply}
      />,
    );
    await user.type(
      screen.getByLabelText("Promotion campaign UUID (optional)"),
      "bad",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "valid promotion campaign UUID",
    );
    expect(apply).not.toHaveBeenCalled();
    await user.clear(
      screen.getByLabelText("Promotion campaign UUID (optional)"),
    );
    screen.getByRole("button", { name: "Apply filters" }).focus();
    await user.keyboard("{Enter}");
    expect(apply).toHaveBeenCalledWith({
      day: "2026-10-07",
      promotionCampaignId: "",
      from: "",
      toExclusive: "",
      months: 3,
      limit: 5,
    });
  });
  it("uses an accessible meter and textual alternative, not an unlabeled chart", () => {
    render(
      <DashboardWorkspace
        access={management}
        audience="management"
        panels={{
          taskCompletionRate: {
            state: "ready",
            data: {
              asOf: "2026-10-07T12:00:00Z",
              from: "2026-10-01T00:00:00Z",
              freshness: "live-current-state",
              toExclusive: "2026-11-01T00:00:00Z",
              counts: {
                total: 4,
                completed: 2,
                pending: 2,
                overdue: 1,
                percent: 50,
              },
            },
          },
        }}
      />,
    );
    expect(
      screen.getByRole("meter", { name: "Completion percentage" }),
    ).toHaveAttribute("value", "50");
    expect(screen.getByText(/2 of 4/)).toBeInTheDocument();
  });
  it("provides a keyboard-scrollable analytics table with headings", () => {
    render(
      <DashboardWorkspace
        access={management}
        audience="management"
        panels={{
          eventProgress: {
            state: "ready",
            data: {
              asOf: "2026-10-07T12:00:00Z",
              items: [{ id: "event-id", total: 2, completed: 1, percent: 50 }],
              freshness: "live-current-state",
              page: 1,
              pageSize: 5,
              total: 1,
            },
          },
        }}
      />,
    );
    expect(
      screen.getByRole("region", { name: /Authorized entities/ }),
    ).toHaveAttribute("tabindex", "0");
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", {
        name: "Subject ID",
      }),
    ).toBeInTheDocument();
  });
});
