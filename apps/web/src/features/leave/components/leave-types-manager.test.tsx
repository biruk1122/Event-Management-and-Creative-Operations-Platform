import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { LeaveTypesManager } from "./leave-types-manager";
import type { LeaveType } from "../lib/leave-types";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: vi.fn() },
}));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const access: CurrentAccess = {
  userId: "admin-1",
  department: null,
  grants: [{ permissionKey: "leave.type.manage", scope: "ORGANIZATION" }],
};

function leaveType(overrides: Partial<LeaveType> = {}): LeaveType {
  return {
    id: "type-1",
    name: "Annual leave",
    description: "Standard yearly leave.",
    isPaid: true,
    requiresDocumentation: false,
    requiresApproval: true,
    isActive: true,
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
      <LeaveTypesManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("LeaveTypesManager", () => {
  it("creates a new leave type", async () => {
    mockGetRoutes({ "/api/v1/leave/types": [leaveType()] });
    post.mockResolvedValue(ok(leaveType({ id: "type-2", name: "Sick leave" })));
    const { user } = setup();

    await screen.findByText("Annual leave");
    await user.click(screen.getByRole("button", { name: "New leave type" }));
    await user.type(screen.getByLabelText("Name"), "Sick leave");
    await user.click(screen.getByRole("button", { name: "Create leave type" }));

    expect(post).toHaveBeenCalledWith(
      "/api/v1/leave/types",
      expect.objectContaining({
        body: expect.objectContaining({
          name: "Sick leave",
          isPaid: true,
          requiresDocumentation: false,
          requiresApproval: true,
        }),
      }),
    );
  });

  it("deactivates an existing leave type", async () => {
    mockGetRoutes({ "/api/v1/leave/types": [leaveType()] });
    patch.mockResolvedValue(ok(leaveType({ isActive: false })));
    const { user } = setup();

    await screen.findByText("Annual leave");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByLabelText("Active"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patch).toHaveBeenCalledWith(
      "/api/v1/leave/types/{id}",
      expect.objectContaining({
        params: { path: { id: "type-1" } },
        body: expect.objectContaining({ isActive: false }),
      }),
    );
  });
});
