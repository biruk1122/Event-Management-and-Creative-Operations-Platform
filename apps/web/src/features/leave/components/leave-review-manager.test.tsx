import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { LeaveReviewManager } from "./leave-review-manager";
import type { LeaveRequest } from "../lib/leave-types";

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: patch, DELETE: vi.fn() },
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
  grants: [{ permissionKey: "leave.review", scope: "DEPARTMENT" }],
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
    reason: "Family trip",
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
      <LeaveReviewManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("LeaveReviewManager", () => {
  it("lists pending requests and approves one with a note", async () => {
    mockGetRoutes({ "/api/v1/leave/requests": [leaveRequest()] });
    patch.mockResolvedValue(ok(leaveRequest({ status: "APPROVED" })));
    const { user } = setup();

    expect(await screen.findByText("Ada Employee")).toBeInTheDocument();
    expect(screen.getByText("“Family trip”")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.type(await screen.findByLabelText("Note (optional)"), "Enjoy!");
    await user.click(
      screen.getByRole("button", { name: "Approve leave request" }),
    );

    expect(patch).toHaveBeenCalledWith(
      "/api/v1/leave/requests/{id}/decision",
      expect.objectContaining({
        params: { path: { id: "request-1" } },
        body: { decision: "APPROVED", reviewNote: "Enjoy!" },
      }),
    );
  });

  it("surfaces the self-approval-forbidden outcome inline", async () => {
    mockGetRoutes({ "/api/v1/leave/requests": [leaveRequest()] });
    patch.mockResolvedValue({
      data: undefined,
      error: { code: "ATTENDANCE_SELF_APPROVAL_FORBIDDEN", status: 409 },
      response: { ok: false, status: 409 },
    });
    const { user } = setup();

    await screen.findByText("Ada Employee");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(
      await screen.findByRole("button", { name: "Reject leave request" }),
    );

    expect(
      await screen.findByText("You cannot decide your own leave request."),
    ).toBeInTheDocument();
  });

  it("switches the status filter and requeries", async () => {
    mockGetRoutes({ "/api/v1/leave/requests": [] });
    const { user } = setup();

    await screen.findByText("No requests with this status.");
    get.mockClear();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Approved" }));

    expect(get).toHaveBeenCalledWith(
      "/api/v1/leave/requests",
      expect.objectContaining({
        params: expect.objectContaining({ query: { status: "APPROVED" } }),
      }),
    );
  });
});
