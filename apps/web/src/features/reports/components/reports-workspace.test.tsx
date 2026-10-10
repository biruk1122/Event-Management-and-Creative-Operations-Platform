import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Report, ReportDetail } from "../lib/report-presentation";
import {
  ReportsWorkspace,
  type ReportsWorkspaceProps,
} from "./reports-workspace";

const report: Report = {
  id: "report-1",
  title: "Week of February 26",
  type: "WEEKLY",
  status: "SUBMITTED",
  periodStart: "2024-02-26",
  periodEnd: "2024-03-03",
  authorId: "author-1",
  departmentId: "department-1",
  workspaceIds: ["workspace-1"],
  departmentActivities: "Rehearsals",
  majorAchievements: "Opening night",
  challenges: "Rain",
  nextWeekPlan: "Tour",
  problemsEncountered: null,
  nextDayPlan: null,
  departmentPerformance: null,
  employeePerformance: null,
  createdAt: "2024-03-03T12:00:00.000Z",
  updatedAt: "2024-03-03T12:00:00.000Z",
  submittedAt: "2024-03-03T12:00:00.000Z",
  reviewedAt: null,
  reviewerId: null,
  reviews: [],
};

const detail: ReportDetail = {
  ...report,
  facts: {
    completedTasksInPeriod: 4,
    inProgressTasksNow: 1,
    pendingTasksNow: 3,
    overdueTasksNow: 2,
    totalProjectsNow: null,
    completedProjectsNow: null,
    activeProjectsNow: null,
    asOf: "2024-03-04T10:00:00.000Z",
  },
  reviews: [
    {
      id: "review-1",
      outcome: "CHANGES_REQUESTED",
      note: "Clarify weather",
      reviewerId: "reviewer-1",
      reviewedAt: "2024-03-04T09:00:00.000Z",
    },
  ],
};

const base: ReportsWorkspaceProps = {
  state: "ready",
  audience: "employee",
  currentUserId: "author-1",
  list: { items: [report], page: 1, pageSize: 10, total: 1 },
};

describe("ReportsWorkspace", () => {
  it("returns focus on draft cancellation and preserves values after a failed save", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(false);
    render(<ReportsWorkspace {...base} canCreate onSaveDraft={save} />);
    await user.click(screen.getByRole("button", { name: "New report" }));
    await user.type(screen.getByLabelText("Title"), "Keep my draft");
    await user.type(screen.getByLabelText("Period start (UTC)"), "2024-02-01");
    await user.type(screen.getByLabelText("Period end (UTC)"), "2024-02-01");
    await user.type(
      screen.getByLabelText("Problems encountered"),
      "Unsaved narrative",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Keep my draft");
    expect(screen.getByLabelText("Problems encountered")).toHaveValue(
      "Unsaved narrative",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "New report" })).toHaveFocus();
  });
  it("shows honest loading, denied, unavailable, and retry states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ReportsWorkspace {...base} state="loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading reports");
    rerender(<ReportsWorkspace {...base} state="denied" />);
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    rerender(<ReportsWorkspace {...base} state="unavailable" />);
    expect(screen.getByRole("status")).toHaveTextContent("not connected yet");
    expect(
      screen.queryByRole("button", { name: "New report" }),
    ).not.toBeInTheDocument();
    rerender(<ReportsWorkspace {...base} state="error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps management ownership and employee content scannable without client-side scope filtering", () => {
    const { rerender } = render(<ReportsWorkspace {...base} />);
    expect(screen.getByRole("heading", { name: "My reports" })).toBeVisible();
    expect(screen.getAllByText("Week of February 26")).toHaveLength(2);
    expect(
      screen.queryByRole("columnheader", { name: "Owner / department" }),
    ).not.toBeInTheDocument();

    rerender(
      <ReportsWorkspace
        {...base}
        audience="management"
        currentUserId="reviewer-1"
        authorNames={{ "author-1": "Ada Lovelace" }}
        departmentNames={{ "department-1": "Production" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Team reports" })).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "Owner / department" }),
    ).toBeVisible();
    expect(screen.getAllByText(/Ada Lovelace/)).toHaveLength(3);
    expect(screen.getAllByText(/Production/)).toHaveLength(3);
  });

  it("offers labelled filters, validates paired dates, and delegates pagination", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const onPageChange = vi.fn();
    render(
      <ReportsWorkspace
        {...base}
        list={{ items: [report], page: 1, pageSize: 1, total: 2 }}
        onFiltersChange={onFiltersChange}
        onPageChange={onPageChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Type"), "WEEKLY");
    await user.type(screen.getByLabelText("Period from (UTC)"), "2024-02-01");
    expect(screen.getByRole("alert")).toHaveTextContent("both period dates");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    await user.type(screen.getByLabelText("Period to (UTC)"), "2024-03-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      type: "WEEKLY",
      status: null,
      periodFrom: "2024-02-01",
      periodTo: "2024-03-01",
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("delegates owner, department, and workspace filters to the server query", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <ReportsWorkspace
        {...base}
        audience="management"
        authorNames={{ "author-1": "Ada Lovelace" }}
        departmentNames={{ "department-1": "Production" }}
        workspaces={[{ id: "workspace-1", name: "Production workspace" }]}
        onFiltersChange={onFiltersChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Author"), "author-1");
    await user.selectOptions(
      screen.getByLabelText("Department"),
      "department-1",
    );
    await user.selectOptions(screen.getByLabelText("Workspace"), "workspace-1");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "author-1",
        departmentId: "department-1",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("blocks a period filter wider than the API's 366-day maximum", () => {
    render(
      <ReportsWorkspace
        {...base}
        filters={{
          type: null,
          status: null,
          periodFrom: "2024-01-01",
          periodTo: "2025-02-01",
        }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("at most 366 days");
  });

  it("shows authoritative facts, narrative, links, and review history with scoped actions", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onReview = vi.fn();
    const onExport = vi.fn();
    const { rerender } = render(
      <ReportsWorkspace
        {...base}
        selectedId="report-1"
        detail={detail}
        onSubmit={onSubmit}
        onReview={onReview}
        onExport={onExport}
      />,
    );
    const facts = screen.getByRole("heading", {
      name: "Work facts",
    }).parentElement!;
    expect(within(facts).getByText("Tasks completed in period")).toBeVisible();
    expect(within(facts).getByText("4")).toBeVisible();
    expect(screen.getByText("Rehearsals")).toBeVisible();
    expect(screen.getByText("Clarify weather")).toBeVisible();
    expect(screen.getByText("workspace-1")).toBeVisible();
    expect(screen.queryByText("Projects total now")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith("report-1");
    expect(
      screen.queryByRole("button", { name: "Mark reviewed" }),
    ).not.toBeInTheDocument();

    rerender(
      <ReportsWorkspace
        {...base}
        currentUserId="reviewer-1"
        audience="management"
        selectedId="report-1"
        detail={detail}
        canReview
        onReview={onReview}
      />,
    );
    await user.type(
      screen.getByLabelText("Review note (optional)"),
      "Looks good",
    );
    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(onReview).toHaveBeenCalledWith("report-1", "REVIEWED", "Looks good");
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).not.toBeInTheDocument();
  });

  it("presents all SRS sections and saves a draft with selected workspaces", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    render(
      <ReportsWorkspace
        {...base}
        canCreate
        onSaveDraft={onSaveDraft}
        workspaces={[{ id: "workspace-1", name: "Production workspace" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "New report" }));
    expect(screen.getByLabelText("Title")).toHaveFocus();
    await user.type(screen.getByLabelText("Title"), "February report");
    await user.selectOptions(screen.getByLabelText("Report type"), "MONTHLY");
    expect(screen.getByLabelText("Department performance")).toBeVisible();
    expect(screen.getByLabelText("Employee performance")).toBeVisible();
    expect(screen.getByLabelText("Major achievements")).toBeVisible();
    expect(screen.getByLabelText("Challenges")).toBeVisible();
    expect(screen.queryByLabelText("Next day's plan")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Period start (UTC)"), "2024-02-01");
    await user.type(screen.getByLabelText("Period end (UTC)"), "2024-02-29");
    await user.click(screen.getByLabelText("Production workspace"));
    await user.type(screen.getByLabelText("Major achievements"), "Launch");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MONTHLY",
        periodStart: "2024-02-01",
        periodEnd: "2024-02-29",
        majorAchievements: "Launch",
        workspaceIds: ["workspace-1"],
      }),
      undefined,
    );
  });

  it("keeps submission disabled until the type-specific sections are complete", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const draft = { ...detail, status: "DRAFT" as const, nextWeekPlan: null };
    const { rerender } = render(
      <ReportsWorkspace
        {...base}
        selectedId="report-1"
        detail={draft}
        onSubmit={onSubmit}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Week of February 26" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    expect(screen.getByText(/Complete every report section/)).toBeVisible();
    rerender(
      <ReportsWorkspace
        {...base}
        selectedId="report-1"
        detail={{ ...draft, nextWeekPlan: "Tour" }}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(onSubmit).toHaveBeenCalledWith("report-1");
  });

  it("distinguishes list and detail failures, empty results, and success notices", () => {
    const { rerender } = render(
      <ReportsWorkspace {...base} list={undefined} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("list is unavailable");
    rerender(
      <ReportsWorkspace
        {...base}
        list={{ items: [], page: 1, pageSize: 10, total: 0 }}
      />,
    );
    expect(screen.getByText("No reports to show")).toBeVisible();
    rerender(
      <ReportsWorkspace
        {...base}
        selectedId="report-1"
        detailState="error"
        notice={{ kind: "success", message: "Draft saved." }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "detail is unavailable",
    );
  });
});
