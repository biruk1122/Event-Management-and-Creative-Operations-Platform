import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { AttendanceSessionsManager } from "./attendance-sessions-manager";
import type { AttendanceSession } from "../lib/attendance-types";

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
  userId: "admin-1",
  department: null,
  grants: [{ permissionKey: "attendance.reports.read", scope: "ORGANIZATION" }],
};

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: "session-1",
    employeeId: "employee-1",
    employeeName: "Ada Employee",
    method: "OFFICE_KIOSK",
    kioskId: "kiosk-1",
    kioskName: "Front Desk",
    eventShiftId: null,
    eventName: null,
    sessionDate: "2026-09-16",
    checkInAt: "2026-09-16T09:00:00.000Z",
    checkOutAt: "2026-09-16T17:00:00.000Z",
    status: "CLOSED",
    scheduledMinutes: null,
    actualMinutes: 480,
    breakMinutes: 30,
    netMinutes: 450,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    potentialOvertimeMinutes: 0,
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
      <AttendanceSessionsManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("AttendanceSessionsManager", () => {
  it("groups sessions by month and sends the right query params", async () => {
    get.mockResolvedValue(
      ok([
        session({ id: "session-1", sessionDate: "2026-09-16" }),
        session({
          id: "session-2",
          sessionDate: "2026-08-03",
          employeeName: "Bo Employee",
          checkInAt: "2026-08-03T08:00:00.000Z",
          checkOutAt: "2026-08-03T16:00:00.000Z",
        }),
      ]),
    );
    setup();

    expect(await screen.findByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("Ada Employee")).toBeInTheDocument();
    expect(screen.getByText("Bo Employee")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/attendance/reports/sessions",
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

  it("renders a dash and a missing-checkout badge when there is no check-out time", async () => {
    get.mockResolvedValue(
      ok([session({ checkOutAt: null, status: "MISSING_CHECKOUT" })]),
    );
    setup();

    await screen.findByText("Ada Employee");
    expect(screen.getByText("Missing checkout")).toBeInTheDocument();
  });

  it("shows an empty state when there are no sessions in range", async () => {
    get.mockResolvedValue(ok([]));
    setup();

    expect(
      await screen.findByText("No attendance sessions in this range."),
    ).toBeInTheDocument();
  });

  it("shows a validation message when the end date precedes the start date", async () => {
    get.mockResolvedValue(ok([session()]));
    const { user } = setup();
    await screen.findByText("Ada Employee");

    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2000-01-01");

    expect(
      await screen.findByText("The end date must be on or after the start date."),
    ).toBeInTheDocument();
  });
});
