import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { LeaveManager } from "./leave-manager";
import type { LeaveRequest, LeaveType } from "../lib/leave-types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const access: CurrentAccess = {
  userId: "employee-1",
  department: null,
  grants: [{ permissionKey: "leave.request.create", scope: "SELF" }],
};

function leaveType(overrides: Partial<LeaveType> = {}): LeaveType {
  return {
    id: "type-1",
    name: "Annual leave",
    description: null,
    isPaid: true,
    requiresDocumentation: false,
    requiresApproval: true,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    status: "PENDING",
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

function mockGetRoutes(routes: Record<string, unknown>) {
  get.mockImplementation((path: string) =>
    Promise.resolve(ok(routes[path] ?? [])),
  );
}

afterEach(() => vi.resetAllMocks());

function setup() {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LeaveManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("LeaveManager", () => {
  it("shows the balance for the default leave type and the employee's own requests", async () => {
    mockGetRoutes({
      "/api/v1/leave/types": [leaveType()],
      "/api/v1/leave/balance": {
        leaveTypeId: "type-1",
        totalRemaining: 12,
        grants: [
          {
            id: "grant-1",
            employeeId: "employee-1",
            leaveTypeId: "type-1",
            leaveTypeName: "Annual leave",
            grantedDays: 14,
            remaining: 12,
            grantedAt: "2025-01-01T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
            note: null,
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      },
      "/api/v1/leave/requests": [leaveRequest()],
    });
    setup();

    expect(await screen.findByText("12 days remaining")).toBeInTheDocument();
    expect(screen.getByText(/12 of 14 days/)).toBeInTheDocument();
    expect(
      screen.getByText(/Annual leave · Dec 24, 2026 – Dec 26, 2026/),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/leave/requests",
      expect.objectContaining({
        params: expect.objectContaining({
          query: expect.objectContaining({ employeeId: "employee-1" }),
        }),
      }),
    );
  });

  it("submits a new leave request through the dialog", async () => {
    mockGetRoutes({
      "/api/v1/leave/types": [leaveType()],
      "/api/v1/leave/balance": {
        leaveTypeId: "type-1",
        totalRemaining: 5,
        grants: [],
      },
      "/api/v1/leave/requests": [],
    });
    post.mockResolvedValue(ok(leaveRequest()));
    const { user } = setup();

    await screen.findByText("5 days remaining");
    await user.click(screen.getByRole("button", { name: "Request leave" }));
    await user.click(screen.getByRole("combobox", { name: "Leave type" }));
    await user.click(
      await screen.findByRole("option", { name: "Annual leave" }),
    );
    await user.type(screen.getByLabelText("Start date"), "2026-12-24");
    await user.type(screen.getByLabelText("End date"), "2026-12-26");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText("Leave request submitted."),
    ).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/api/v1/leave/requests",
      expect.objectContaining({
        body: expect.objectContaining({
          leaveTypeId: "type-1",
          startDate: "2026-12-24",
          endDate: "2026-12-26",
        }),
      }),
    );
  });

  it("withdraws a pending request", async () => {
    mockGetRoutes({
      "/api/v1/leave/types": [leaveType()],
      "/api/v1/leave/balance": {
        leaveTypeId: "type-1",
        totalRemaining: 5,
        grants: [],
      },
      "/api/v1/leave/requests": [leaveRequest()],
    });
    post.mockResolvedValue(ok(leaveRequest({ status: "WITHDRAWN" })));
    const { user } = setup();

    await screen.findByText(/Annual leave · Dec 24, 2026/);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(await screen.findByText("Request withdrawn.")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/api/v1/leave/requests/{id}/withdraw",
      expect.objectContaining({ params: { path: { id: "request-1" } } }),
    );
  });
});
