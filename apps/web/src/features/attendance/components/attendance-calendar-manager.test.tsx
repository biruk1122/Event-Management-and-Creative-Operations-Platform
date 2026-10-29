import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { AttendanceCalendarManager } from "./attendance-calendar-manager";
import type { Holiday, WeekdaySchedule } from "../lib/attendance-types";

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: del },
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
  grants: [
    { permissionKey: "attendance.calendar.manage", scope: "ORGANIZATION" },
  ],
};

function weekdays(): WeekdaySchedule[] {
  const defaults: {
    dayOfWeek: number;
    dayName: string;
    type: WeekdaySchedule["type"];
  }[] = [
    { dayOfWeek: 0, dayName: "Sunday", type: "OFF" },
    { dayOfWeek: 1, dayName: "Monday", type: "FULL" },
    { dayOfWeek: 2, dayName: "Tuesday", type: "FULL" },
    { dayOfWeek: 3, dayName: "Wednesday", type: "FULL" },
    { dayOfWeek: 4, dayName: "Thursday", type: "FULL" },
    { dayOfWeek: 5, dayName: "Friday", type: "FULL" },
    { dayOfWeek: 6, dayName: "Saturday", type: "HALF" },
  ];
  return defaults.map((entry) => ({ ...entry, effectiveFrom: "1970-01-01" }));
}

function holiday(overrides: Partial<Holiday> = {}): Holiday {
  return {
    id: "holiday-1",
    date: "2027-01-07",
    name: "Christmas",
    createdByName: "Super Admin",
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
      <AttendanceCalendarManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("AttendanceCalendarManager", () => {
  it("renders every weekday and every recorded holiday", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [holiday()],
    });
    setup();

    expect(await screen.findByText("Sunday")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
    expect(screen.getByText(/Half working day/)).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByText("2027-01-07")).toBeInTheDocument();
  });

  it("changes a weekday's type from an effective date", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [],
    });
    post.mockResolvedValue(
      ok({
        dayOfWeek: 6,
        dayName: "Saturday",
        type: "OFF",
        effectiveFrom: "2027-03-01",
      }),
    );
    const { user } = setup();

    await screen.findByText("Saturday");
    const row = screen.getByText("Saturday").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Change" }));

    await user.click(screen.getByRole("combobox", { name: "New type" }));
    await user.click(await screen.findByRole("option", { name: "Day off" }));
    await user.clear(screen.getByLabelText("Effective from"));
    await user.type(screen.getByLabelText("Effective from"), "2027-03-01");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/attendance/calendar/weekdays",
        expect.objectContaining({
          body: { dayOfWeek: 6, type: "OFF", effectiveFrom: "2027-03-01" },
        }),
      ),
    );
  });

  it("shows a conflict message when a weekday change is already effective from that date", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [],
    });
    post.mockResolvedValue({
      data: undefined,
      error: { code: "ATTENDANCE_WEEKDAY_SCHEDULE_CONFLICT", status: 409 },
      response: { ok: false, status: 409 },
    });
    const { user } = setup();

    await screen.findByText("Saturday");
    const row = screen.getByText("Saturday").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "A change for this weekday is already effective from that date.",
      ),
    ).toBeInTheDocument();
  });

  it("adds a holiday and clears the form on success", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [],
    });
    post.mockResolvedValue(
      ok(holiday({ id: "holiday-2", name: "Labour Day", date: "2027-05-01" })),
    );
    const { user } = setup();

    await screen.findByText("No holidays recorded yet.");
    await user.type(screen.getByLabelText("Date"), "2027-05-01");
    await user.type(screen.getByLabelText("Name"), "Labour Day");
    await user.click(screen.getByRole("button", { name: "Add holiday" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/attendance/calendar/holidays",
        expect.objectContaining({
          body: { date: "2027-05-01", name: "Labour Day" },
        }),
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
  });

  it("shows a conflict message when a holiday date is already taken", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [],
    });
    post.mockResolvedValue({
      data: undefined,
      error: { code: "ATTENDANCE_HOLIDAY_DATE_TAKEN", status: 409 },
      response: { ok: false, status: 409 },
    });
    const { user } = setup();

    await screen.findByText("No holidays recorded yet.");
    await user.type(screen.getByLabelText("Date"), "2027-05-01");
    await user.type(screen.getByLabelText("Name"), "Labour Day");
    await user.click(screen.getByRole("button", { name: "Add holiday" }));

    expect(
      await screen.findByText("A holiday is already recorded for that date."),
    ).toBeInTheDocument();
  });

  it("edits a holiday's name and removes it", async () => {
    mockGetRoutes({
      "/api/v1/attendance/calendar/weekdays": weekdays(),
      "/api/v1/attendance/calendar/holidays": [holiday()],
    });
    patch.mockResolvedValue(ok(holiday({ name: "Christmas Day" })));
    del.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { ok: true, status: 204 },
    });
    const { user } = setup();

    await screen.findByText("Christmas");
    const row = screen.getByText("Christmas").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Edit" }));
    const nameInput = await within(row).findByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Christmas Day");
    await user.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/attendance/calendar/holidays/{id}",
        expect.objectContaining({
          params: { path: { id: "holiday-1" } },
          body: { date: "2027-01-07", name: "Christmas Day" },
        }),
      ),
    );

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith(
        "/api/v1/attendance/calendar/holidays/{id}",
        expect.objectContaining({ params: { path: { id: "holiday-1" } } }),
      ),
    );
  });
});
