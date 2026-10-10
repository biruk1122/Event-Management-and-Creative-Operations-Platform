import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import type { Report, ReportDetail } from "../lib/report-presentation";
import { ReportsManager } from "./reports-manager";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch },
}));

const now = "2024-03-04T10:00:00.000Z";
function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-1",
    authorId: "author-1",
    departmentId: null,
    title: "Weekly production",
    type: "WEEKLY",
    status: "SUBMITTED",
    periodStart: "2024-02-26",
    periodEnd: "2024-03-03",
    departmentActivities: "Rehearsals",
    majorAchievements: "Launch",
    challenges: "Rain",
    nextWeekPlan: "Tour",
    problemsEncountered: null,
    nextDayPlan: null,
    departmentPerformance: null,
    employeePerformance: null,
    workspaceIds: [],
    reviews: [],
    submittedAt: now,
    reviewedAt: null,
    reviewerId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
const detail: ReportDetail = {
  ...report(),
  facts: {
    asOf: now,
    completedTasksInPeriod: 4,
    inProgressTasksNow: 1,
    pendingTasksNow: 3,
    overdueTasksNow: 2,
    totalProjectsNow: null,
    completedProjectsNow: null,
    activeProjectsNow: null,
  },
};
const ok = (data: unknown, status = 200) => ({ data, response: { status } });
const fail = (code: string, status: number) => ({
  error: { code, status },
  response: { status },
});

function access(...keys: string[]): CurrentAccess {
  return {
    userId: "author-1",
    grants: ["report.read", ...keys].map((permissionKey) => ({
      permissionKey,
      scope: "ORGANIZATION",
    })),
  } as CurrentAccess;
}

let total: number;
beforeEach(() => {
  vi.resetAllMocks();
  total = 1;
  get.mockImplementation(
    async (
      path: string,
      options?: {
        params?: { query?: Record<string, unknown>; path?: { id?: string } };
      },
    ) => {
      if (path === "/api/v1/reports") {
        const page = Number(options?.params?.query?.page ?? 1);
        return ok({
          items:
            page === 1
              ? [report()]
              : [report({ id: "report-2", title: "Other report" })],
          page,
          pageSize: 10,
          total,
        });
      }
      if (path === "/api/v1/reports/{id}") return ok(detail);
      if (path === "/api/v1/reports/{id}/export") return ok(detail);
      return ok({ items: [], page: 1, pageSize: 100, total: 0 });
    },
  );
  post.mockResolvedValue(ok(report({ status: "DRAFT" }), 201));
  patch.mockResolvedValue(ok(report({ status: "DRAFT" })));
});

function setup(currentAccess = access()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReportsManager access={currentAccess} />
    </QueryClientProvider>,
  );
  return client;
}

describe("ReportsManager", () => {
  it("uses server-filtered pages and refreshes detail independently", async () => {
    const user = userEvent.setup();
    total = 12;
    setup();
    expect(await screen.findByText("12 reports")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Type"), "WEEKLY");
    await user.selectOptions(screen.getByLabelText("Status"), "SUBMITTED");
    await user.type(screen.getByLabelText("Period from (UTC)"), "2024-02-01");
    await user.type(screen.getByLabelText("Period to (UTC)"), "2024-03-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/reports",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              type: "WEEKLY",
              status: "SUBMITTED",
              periodFrom: "2024-02-01",
              periodTo: "2024-03-01",
            }),
          },
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/reports",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
    await user.click(
      screen.getAllByRole("button", { name: /Other report/ })[0]!,
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/reports/{id}",
        expect.objectContaining({ params: { path: { id: "report-2" } } }),
      ),
    );
    expect(await screen.findByText("Work facts")).toBeVisible();
  });

  it("does not show metrics when the server denies a selected report", async () => {
    const user = userEvent.setup();
    get.mockImplementation(async (path: string) =>
      path === "/api/v1/reports"
        ? ok({ items: [report()], page: 1, pageSize: 10, total: 1 })
        : fail("PERMISSION_DENIED", 403),
    );
    setup();
    await screen.findByText("1 report");
    await user.click(
      screen.getAllByRole("button", { name: /Weekly production/ })[0]!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Report detail is unavailable",
    );
    expect(
      screen.queryByText("Tasks completed in period"),
    ).not.toBeInTheDocument();
  });

  it("creates a real draft, invalidates data, and shows a success state", async () => {
    const user = userEvent.setup();
    setup(access("report.create"));
    await screen.findByText("1 report");
    await user.click(screen.getByRole("button", { name: "New report" }));
    await user.type(screen.getByLabelText("Title"), "Daily work");
    await user.type(screen.getByLabelText("Period start (UTC)"), "2024-02-29");
    await user.type(screen.getByLabelText("Period end (UTC)"), "2024-02-29");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/reports",
        expect.objectContaining({
          body: expect.objectContaining({ title: "Daily work", type: "DAILY" }),
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Report draft saved",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New report draft" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      get.mock.calls.filter((call) => call[0] === "/api/v1/reports").length,
    ).toBeGreaterThan(1);
  });

  it("reviews only with a review grant and reconciles the list and detail", async () => {
    const user = userEvent.setup();
    setup({
      userId: "reviewer-1",
      grants: [
        { permissionKey: "report.read", scope: "ORGANIZATION" },
        { permissionKey: "report.review", scope: "ORGANIZATION" },
      ],
    } as CurrentAccess);
    await screen.findByText("1 report");
    await user.click(
      screen.getAllByRole("button", { name: /Weekly production/ })[0]!,
    );
    await screen.findByRole("button", { name: "Mark reviewed" });
    post.mockResolvedValueOnce(ok(report({ status: "REVIEWED" })));
    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/reports/{id}/reviews",
        expect.objectContaining({ body: { outcome: "REVIEWED" } }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Report reviewed",
    );
    expect(
      screen.queryByRole("button", { name: "New report" }),
    ).not.toBeInTheDocument();
  });

  it("submits an authored complete draft and exports only the authorized snapshot", async () => {
    const user = userEvent.setup();
    const draft = { ...detail, status: "DRAFT" as const };
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/reports")
        return ok({
          items: [report({ status: "DRAFT" })],
          page: 1,
          pageSize: 10,
          total: 1,
        });
      if (path === "/api/v1/reports/{id}") return ok(draft);
      if (path === "/api/v1/reports/{id}/export") return ok(draft);
      return ok({ items: [] });
    });
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    try {
      setup(access("report.submit"));
      await screen.findByText("1 report");
      await user.click(
        screen.getAllByRole("button", { name: /Weekly production/ })[0]!,
      );
      await user.click(
        await screen.findByRole("button", { name: "Submit for review" }),
      );
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          "/api/v1/reports/{id}/submit",
          expect.objectContaining({ params: { path: { id: "report-1" } } }),
        ),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Report submitted",
      );
      await user.click(screen.getByRole("button", { name: "Export JSON" }));
      await waitFor(() =>
        expect(get).toHaveBeenCalledWith(
          "/api/v1/reports/{id}/export",
          expect.anything(),
        ),
      );
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the report list available if optional directory enrichment fails", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/reports")
        return ok({ items: [report()], page: 1, pageSize: 10, total: 1 });
      if (path === "/api/v1/users") return fail("PERMISSION_DENIED", 403);
      return ok({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    setup(access("user.read"));
    expect(await screen.findByText("1 report")).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some directory or workspace choices are unavailable",
    );
    expect(
      screen.getAllByRole("button", { name: /Weekly production/ }),
    ).toHaveLength(2);
  });

  it("prevents duplicate reviews and retains focus and notes while a request is pending", async () => {
    const user = userEvent.setup();
    setup({
      userId: "reviewer-1",
      grants: [
        { permissionKey: "report.read", scope: "ORGANIZATION" },
        { permissionKey: "report.review", scope: "ORGANIZATION" },
      ],
    } as CurrentAccess);
    await screen.findByText("1 report");
    await user.click(
      screen.getAllByRole("button", { name: /Weekly production/ })[0]!,
    );
    const button = await screen.findByRole("button", { name: "Mark reviewed" });
    await user.type(
      screen.getByLabelText("Review note (optional)"),
      "Keep this note",
    );
    let finish!: (value: ReturnType<typeof fail>) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
    expect(button).toHaveFocus();
    expect(post).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(post).toHaveBeenCalledOnce();
    finish(fail("REPORT_CONFLICT", 409));
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(screen.getByLabelText("Review note (optional)")).toHaveValue(
      "Keep this note",
    );
    expect(button).toHaveFocus();
  });
});
