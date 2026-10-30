import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { LeaveGrantsManager } from "./leave-grants-manager";
import type { LeaveGrant, LeaveType } from "../lib/leave-types";

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
  userId: "manager-1",
  department: { id: "dept-1", name: "Production", active: true },
  grants: [{ permissionKey: "leave.grant.manage", scope: "DEPARTMENT" }],
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

function leaveGrant(overrides: Partial<LeaveGrant> = {}): LeaveGrant {
  return {
    id: "grant-1",
    employeeId: "employee-1",
    leaveTypeId: "type-1",
    leaveTypeName: "Annual leave",
    grantedDays: 14,
    remaining: 14,
    grantedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2028-01-01T00:00:00.000Z",
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
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
      <LeaveGrantsManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("LeaveGrantsManager", () => {
  it("loads an employee's grants once chosen and creates a new one", async () => {
    mockGetRoutes({
      "/api/v1/tasks/eligible-assignees": {
        items: [
          {
            id: "employee-1",
            firstName: "Ada",
            lastName: "Employee",
            email: "ada@test.invalid",
          },
        ],
      },
      "/api/v1/leave/types": [leaveType()],
      "/api/v1/leave/grants": [leaveGrant()],
    });
    post.mockResolvedValue(
      ok(leaveGrant({ id: "grant-2", grantedDays: 10, remaining: 10 })),
    );
    const { user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Employee" }));
    await user.click(
      await screen.findByRole("option", { name: "Ada Employee" }),
    );

    expect(
      await screen.findByText(/Annual leave · 14 of 14 days remaining/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New grant" }));
    await user.click(screen.getByRole("combobox", { name: "Leave type" }));
    await user.click(
      await screen.findByRole("option", { name: "Annual leave" }),
    );
    await user.type(screen.getByLabelText("Days granted"), "10");
    await user.click(screen.getByRole("button", { name: "Grant leave" }));

    expect(post).toHaveBeenCalledWith(
      "/api/v1/leave/grants",
      expect.objectContaining({
        body: {
          employeeId: "employee-1",
          leaveTypeId: "type-1",
          grantedDays: 10,
        },
      }),
    );
  });

  it("rejects an out-of-range day count before submitting", async () => {
    mockGetRoutes({
      "/api/v1/tasks/eligible-assignees": {
        items: [
          {
            id: "employee-1",
            firstName: "Ada",
            lastName: "Employee",
            email: "ada@test.invalid",
          },
        ],
      },
      "/api/v1/leave/types": [leaveType()],
      "/api/v1/leave/grants": [],
    });
    const { user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Employee" }));
    await user.click(
      await screen.findByRole("option", { name: "Ada Employee" }),
    );
    await screen.findByText("No grants recorded yet.");

    await user.click(screen.getByRole("button", { name: "New grant" }));
    await user.click(screen.getByRole("combobox", { name: "Leave type" }));
    await user.click(
      await screen.findByRole("option", { name: "Annual leave" }),
    );
    await user.type(screen.getByLabelText("Days granted"), "999");
    await user.click(screen.getByRole("button", { name: "Grant leave" }));

    expect(
      await screen.findByText("Enter a number of days between 1 and 365."),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
