import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { AttendanceReportManager } from "./attendance-report-manager";
import type { AttendanceSummary } from "../lib/attendance-types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const access: CurrentAccess = {
  userId: "manager-1",
  department: null,
  grants: [{ permissionKey: "attendance.reports.read", scope: "ORGANIZATION" }],
};

function row(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    employeeId: "employee-1",
    employeeName: "Ada Employee",
    sessionsCount: 5,
    actualMinutes: 2400,
    lateMinutes: 15,
    earlyDepartureMinutes: 0,
    approvedOvertimeMinutes: 60,
    potentialOvertimeMinutes: 90,
    scheduledDays: 20,
    presentDays: 18,
    absentDays: 2,
    onLeaveDays: 0,
    ...overrides,
  };
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

afterEach(() => vi.resetAllMocks());

function setup() {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AttendanceReportManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("AttendanceReportManager", () => {
  it("loads the default month-to-date range and renders per-employee totals", async () => {
    get.mockResolvedValue(ok([row()]));
    setup();

    expect(await screen.findByText("Ada Employee")).toBeInTheDocument();
    expect(screen.getByText("40h")).toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/attendance/reports/summary",
      expect.objectContaining({
        params: expect.objectContaining({
          query: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("shows an empty state when there are no sessions or leave in range", async () => {
    get.mockResolvedValue(ok([]));
    setup();

    expect(
      await screen.findByText(
        "No attendance sessions or approved leave in this range.",
      ),
    ).toBeInTheDocument();
  });

  it("shows approved leave days for an employee, including one with no attendance session at all", async () => {
    get.mockResolvedValue(
      ok([
        row({ onLeaveDays: 3 }),
        row({
          employeeId: "employee-2",
          employeeName: "Beth Employee",
          sessionsCount: 0,
          actualMinutes: 0,
          lateMinutes: 0,
          approvedOvertimeMinutes: 0,
          potentialOvertimeMinutes: 0,
          onLeaveDays: 10,
        }),
      ]),
    );
    setup();

    await screen.findByText("Ada Employee");
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("Beth Employee")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });

  it("shows Scheduled, Present, and Absent day counts for an employee", async () => {
    get.mockResolvedValue(
      ok([row({ scheduledDays: 22, presentDays: 19, absentDays: 3 })]),
    );
    setup();

    await screen.findByText("Ada Employee");
    expect(screen.getByText("22 days")).toBeInTheDocument();
    expect(screen.getByText("19 days")).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
  });

  it("shows a validation message when the end date precedes the start date", async () => {
    get.mockResolvedValue(ok([row()]));
    const { user } = setup();
    await screen.findByText("Ada Employee");

    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2000-01-01");

    expect(
      await screen.findByText(
        "The end date must be on or after the start date.",
      ),
    ).toBeInTheDocument();
  });
});
