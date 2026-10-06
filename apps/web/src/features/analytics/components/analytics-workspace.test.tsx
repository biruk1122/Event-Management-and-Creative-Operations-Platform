import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsWorkspace,
  type AnalyticsWorkspaceProps,
} from "./analytics-workspace";
import {
  MEASURES,
  type Measure,
  type Responses,
} from "../lib/analytics-presentation";

const allowed = Object.fromEntries(
  Object.keys(MEASURES).map((key) => [key, true]),
) as Record<Measure, boolean>;
const stamp = {
  asOf: "2026-10-05T12:00:00.000Z",
  freshness: "live-current-state" as const,
};
const period = { from: "2026-09-01", toExclusive: "2026-10-01" };
const filters = { ...period, subjectId: "", pageSize: 25 };
const counts = { completed: 2, total: 4, pending: 2, overdue: 1, percent: 50 };
const tasks: Responses["tasks"] = { ...stamp, ...period, counts };
const work: Responses["departments"] = {
  ...stamp,
  ...period,
  page: 1,
  pageSize: 25,
  total: 51,
  items: [{ ...counts, id: "subject-1" }],
};
const progress: Responses["events"] = {
  ...stamp,
  page: 1,
  pageSize: 25,
  total: 1,
  items: [{ id: "event-1", total: 4, completed: 2, percent: 50 }],
};
const base: AnalyticsWorkspaceProps = {
  allowed,
  scopeLabel: "Organization",
  filters,
  panels: { tasks: { state: "ready", data: tasks } },
};

describe("AnalyticsWorkspace", () => {
  it("renders filtered marketing results as entity progress, not promotion channels", () => {
    // Runtime filter metadata must not act as a response-shape discriminator.
    const filteredCampaign = {
      ...progress,
      campaignId: "campaign-1",
      campaignType: "MARKETING",
    };
    render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="campaigns"
        panels={{
          campaigns: {
            state: "ready",
            data: filteredCampaign,
          },
        }}
      />,
    );
    expect(screen.getByRole("rowheader", { name: "event-1" })).toBeVisible();
    expect(screen.getByText("2 / 4")).toBeVisible();
    expect(screen.queryByText(/Promotion campaign:/)).not.toBeInTheDocument();
  });
  it("presents counts, rate, UTC cohort and server freshness without inventing a snapshot", () => {
    render(<AnalyticsWorkspace {...base} />);
    expect(screen.getByText("50%", { selector: "p" })).toBeVisible();
    expect(screen.getByText("(2 of 4)")).toBeVisible();
    expect(
      screen.getByText(/not a historical or globally atomic snapshot/),
    ).toBeVisible();
    expect(screen.getByText(/2026-09-01 to 2026-10-01/)).toBeVisible();
    expect(screen.getByText(/Under Review remains pending/)).toBeVisible();
    expect(
      screen.getByRole("meter", { name: "Completion percentage" }),
    ).toHaveAttribute("value", "50");
    expect(
      screen.getByRole("button", { name: "Export analytics" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Export analytics" }),
    ).toHaveAccessibleDescription(/not supported/);
  });

  it("does not misrepresent an empty denominator as a zero rate", () => {
    render(
      <AnalyticsWorkspace
        {...base}
        panels={{
          tasks: {
            state: "ready",
            data: {
              ...tasks,
              counts: {
                total: 0,
                completed: 0,
                pending: 0,
                overdue: 0,
                percent: null,
              },
            },
          },
        }}
      />,
    );
    expect(screen.getByText("No eligible work")).toBeVisible();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No eligible tasks in this creation period/),
    ).toBeVisible();
  });

  it("hides unauthorized measures and cached data after grant loss, including ordinary employees", () => {
    const { rerender } = render(<AnalyticsWorkspace {...base} />);
    rerender(
      <AnalyticsWorkspace {...base} allowed={{ ...allowed, tasks: false }} />,
    );
    expect(
      screen.queryByRole("option", { name: "Task completion" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
    rerender(
      <AnalyticsWorkspace
        {...base}
        allowed={
          Object.fromEntries(
            Object.keys(allowed).map((key) => [key, false]),
          ) as Record<Measure, boolean>
        }
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Employee, dashboard, and report access do not grant",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it.each(["loading", "unavailable", "denied", "error"] as const)(
    "shows honest %s state without stale counts",
    async (state) => {
      const retry = vi.fn();
      render(
        <AnalyticsWorkspace
          {...base}
          panels={{ tasks: { state } }}
          onRetry={retry}
        />,
      );
      expect(screen.queryByText("50%")).not.toBeInTheDocument();
      if (state === "loading")
        expect(screen.getByRole("status")).toHaveTextContent(
          "Loading task completion",
        );
      if (state === "unavailable") {
        expect(screen.getByRole("status")).toHaveTextContent(
          "no sample results",
        );
        expect(
          screen.getByRole("button", { name: "Apply filters" }),
        ).toBeDisabled();
      }
      if (state === "denied")
        expect(screen.getByRole("alert")).toHaveTextContent(
          "scoped analytics grant",
        );
      if (state === "error") {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "not zero activity",
        );
        await userEvent.click(
          screen.getByRole("button", { name: "Try again" }),
        );
        expect(retry).toHaveBeenCalledWith("tasks");
      }
    },
  );

  it("preserves successful data in a partial failure and switches measures with the keyboard", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <AnalyticsWorkspace
        {...base}
        panels={{ ...base.panels, departments: { state: "error" } }}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Some measures are unavailable",
    );
    const selector = screen.getByRole("combobox", {
      name: "Analytics measure",
    });
    await user.tab();
    expect(selector).toHaveFocus();
    await user.selectOptions(selector, "departments");
    expect(
      screen.getByRole("heading", { name: "Department performance" }),
    ).toBeVisible();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledWith("departments");
  });

  it("applies bounded filters and refreshes through supplied handlers, without fetching", async () => {
    const apply = vi.fn(),
      retry = vi.fn();
    render(<AnalyticsWorkspace {...base} onApply={apply} onRetry={retry} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    expect(apply).toHaveBeenCalledWith("tasks", filters);
    await userEvent.clear(screen.getByLabelText("End (exclusive, UTC)"));
    expect(screen.getByRole("alert")).toHaveTextContent("two valid UTC dates");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh measure" }),
    );
    expect(retry).toHaveBeenCalledWith("tasks");
  });

  it("paginates only the supplied authorized page and never requests beyond the offset cap", async () => {
    const change = vi.fn();
    const { rerender } = render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="departments"
        panels={{ departments: { state: "ready", data: work } }}
        onPageChange={change}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(change).toHaveBeenCalledWith("departments", 2);
    expect(
      screen.getByText("Page 1 of 3 · 51 authorized subjects"),
    ).toBeVisible();
    expect(screen.getByRole("table")).toHaveAccessibleName(
      "Authorized entities — deterministic ID order",
    );
    expect(screen.getByRole("region", { name: /table/ })).toHaveAttribute(
      "tabindex",
      "0",
    );
    rerender(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="departments"
        panels={{
          departments: {
            state: "ready",
            data: { ...work, page: 401, total: 100_000 },
          },
        }}
        onPageChange={change}
      />,
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByText(/Paging limit reached/)).toBeVisible();
  });

  it("renders employee performance as transparent non-additive work counts", () => {
    render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="employees"
        panels={{ employees: { state: "ready", data: work } }}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Pending" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Overdue" })).toBeVisible();
    expect(screen.getByText(/employee totals are not additive/)).toBeVisible();
  });

  it.each(["events", "campaigns"] as const)(
    "keeps %s progress all-time with a textual chart alternative",
    (measure) => {
      render(
        <AnalyticsWorkspace
          {...base}
          initialMeasure={measure}
          panels={{ [measure]: { state: "ready", data: progress } }}
        />,
      );
      expect(screen.getByText(/Current all-time work/)).toBeVisible();
      expect(
        screen.queryByLabelText("Creation period start (UTC)"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("rowheader", { name: "event-1" })).toBeVisible();
      expect(screen.getByText("2 / 4")).toBeVisible();
    },
  );

  it("shows promotion channel counts and requires a campaign UUID before applying", async () => {
    const apply = vi.fn();
    render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="promotion"
        onApply={apply}
        panels={{
          promotion: {
            state: "ready",
            data: {
              ...stamp,
              campaignId: "campaign-1",
              items: [
                {
                  channel: "RADIO_PROMOTION",
                  completed: 1,
                  total: 2,
                  percent: 50,
                },
              ],
            },
          },
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "promotion campaign ID",
    );
    expect(screen.getByText("radio promotion")).toBeVisible();
    expect(screen.getByText(/Not reach, revenue, or ROI/)).toBeVisible();
    await userEvent.type(
      screen.getByLabelText("Promotion campaign ID (required)"),
      "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    expect(apply).toHaveBeenCalledOnce();
  });

  it("keeps monthly source counts separate and completion throughput distinct", () => {
    render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="monthly"
        panels={{
          monthly: {
            state: "ready",
            data: {
              ...stamp,
              ...period,
              items: [
                {
                  month: "2026-09",
                  tasksCreated: 10,
                  eventsCreated: 2,
                  projectsCreated: 3,
                  productionsCreated: 1,
                  campaignsCreated: 2,
                  tasksCompleted: 17,
                },
              ],
            },
          },
        }}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getByText("17")).toBeVisible();
    expect(
      screen.getByText(/must not be added into an activity total/),
    ).toBeVisible();
    expect(
      screen.getByText(/Current-month observations may be partial/),
    ).toBeVisible();
  });

  it("distinguishes empty subject results from denial and announces refresh success", () => {
    render(
      <AnalyticsWorkspace
        {...base}
        initialMeasure="employees"
        notice="Employee performance refreshed."
        panels={{
          employees: { state: "ready", data: { ...work, items: [], total: 0 } },
        }}
      />,
    );
    expect(screen.getByText(/not a permission denial/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("refreshed");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
