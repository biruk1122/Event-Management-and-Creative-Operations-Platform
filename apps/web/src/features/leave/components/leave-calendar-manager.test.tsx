import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { LeaveCalendarManager } from "./leave-calendar-manager";
import type { LeaveRequest } from "../lib/leave-types";

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
  grants: [{ permissionKey: "leave.review", scope: "ORGANIZATION" }],
};

function leaveRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "request-1",
    employeeId: "employee-1",
    employeeName: "Ada Employee",
    leaveTypeId: "type-1",
    leaveTypeName: "Annual leave",
    startDate: "2026-12-24",
    endDate: "2026-12-26",
    daysRequested: 3,
    reason: null,
    status: "APPROVED",
    reviewedByName: "Manager Mo",
    reviewedAt: "2026-11-02T00:00:00.000Z",
    reviewNote: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

afterEach(() => vi.resetAllMocks());

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LeaveCalendarManager access={access} />
    </QueryClientProvider>,
  );
}

describe("LeaveCalendarManager", () => {
  it("groups approved leave by start date", async () => {
    get.mockResolvedValue(ok([leaveRequest()]));
    setup();

    expect(await screen.findByText("Ada Employee")).toBeInTheDocument();
    expect(
      screen.getByText(/Annual leave · through Dec 26, 2026/),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/leave/calendar",
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

  it("shows an empty state when there is no approved leave in range", async () => {
    get.mockResolvedValue(ok([]));
    setup();

    expect(
      await screen.findByText("No approved leave in this range."),
    ).toBeInTheDocument();
  });
});
