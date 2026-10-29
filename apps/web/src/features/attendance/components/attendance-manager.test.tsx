import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { AttendanceManager } from "./attendance-manager";
import type { AttendanceSession, MyShift } from "../lib/attendance-types";

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
  userId: "viewer-1",
  department: null,
  grants: [{ permissionKey: "attendance.punch", scope: "SELF" }],
};

function shift(overrides: Partial<MyShift> = {}): MyShift {
  return {
    id: "shift-1",
    eventName: "Spring Gala",
    label: "Front of house",
    locationLabel: "Main hall",
    plannedStartAt: "2026-09-16T09:00:00.000Z",
    plannedEndAt: "2026-09-16T17:00:00.000Z",
    status: "CONFIRMED",
    timeZone: "UTC",
    ...overrides,
  };
}

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: "session-1",
    employeeId: "viewer-1",
    employeeName: "Ada Employee",
    eventName: "Spring Gala",
    eventShiftId: "shift-1",
    method: "MOBILE_EVENT",
    status: "CLOSED",
    sessionDate: "2026-09-16",
    checkInAt: "2026-09-16T09:00:00.000Z",
    checkOutAt: "2026-09-16T17:00:00.000Z",
    actualMinutes: 480,
    netMinutes: 450,
    scheduledMinutes: 480,
    breakMinutes: 30,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    potentialOvertimeMinutes: 0,
    kioskId: null,
    kioskName: null,
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
      <AttendanceManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("AttendanceManager", () => {
  it("lists assigned shifts and checks in on click, without geolocation available", async () => {
    mockGetRoutes({
      "/api/v1/attendance/mobile/shifts": [shift()],
      "/api/v1/attendance/mobile/sessions": [],
    });
    post.mockResolvedValue(
      ok({
        message: "Checked in successfully.",
        verificationResult: "VERIFIED",
        session: session({ status: "OPEN", checkOutAt: null }),
      }),
    );
    const { user } = setup();

    expect(await screen.findByText("Spring Gala · Front of house")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByText("Checked in successfully.")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/api/v1/attendance/mobile/punch",
      expect.objectContaining({
        body: expect.objectContaining({ punchType: "CHECK_IN", eventShiftId: "shift-1" }),
      }),
    );
  });

  it("shows the open session with a check-out action instead of the shift list", async () => {
    mockGetRoutes({
      "/api/v1/attendance/mobile/shifts": [shift()],
      "/api/v1/attendance/mobile/sessions": [
        session({ status: "OPEN", checkOutAt: null }),
      ],
    });
    post.mockResolvedValue(
      ok({
        message: "Checked out successfully.",
        verificationResult: "VERIFIED",
        session: session({ status: "CLOSED" }),
      }),
    );
    const { user } = setup();

    expect(await screen.findByText("Checked in · Spring Gala")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check out" }));

    expect(await screen.findByText("Checked out successfully.")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/api/v1/attendance/mobile/punch",
      expect.objectContaining({
        body: expect.objectContaining({ punchType: "CHECK_OUT" }),
      }),
    );
  });

  it("surfaces a leave-conflict outcome as a readable message", async () => {
    mockGetRoutes({
      "/api/v1/attendance/mobile/shifts": [shift()],
      "/api/v1/attendance/mobile/sessions": [],
    });
    post.mockResolvedValue({
      data: undefined,
      error: { code: "ATTENDANCE_LEAVE_CONFLICT", status: 409 },
      response: { ok: false, status: 409 },
    });
    const { user } = setup();

    await screen.findByText("Spring Gala · Front of house");
    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(
      await screen.findByText("You have approved leave covering this date."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no assigned shifts and no history", async () => {
    mockGetRoutes({
      "/api/v1/attendance/mobile/shifts": [],
      "/api/v1/attendance/mobile/sessions": [],
    });
    setup();

    expect(
      await screen.findByText("You have no assigned event shifts to check into right now."),
    ).toBeInTheDocument();
    expect(screen.getByText("No attendance recorded yet.")).toBeInTheDocument();
  });
});
