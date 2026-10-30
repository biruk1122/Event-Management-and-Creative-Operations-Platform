import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { ShiftScheduleManager } from "./shift-schedule-manager";
import type { EventShift } from "../lib/attendance-types";

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
  department: null,
  grants: [
    { permissionKey: "attendance.schedule.manage", scope: "DEPARTMENT" },
  ],
};

function shift(overrides: Partial<EventShift> = {}): EventShift {
  return {
    id: "shift-1",
    eventId: "event-1",
    eventName: "Spring Gala",
    label: "Front of house",
    locationLabel: "Main hall",
    plannedStartAt: "2026-09-16T09:00:00.000Z",
    plannedEndAt: "2026-09-16T17:00:00.000Z",
    timeZone: "UTC",
    latitude: 40.7128,
    longitude: -74.006,
    geofenceRadiusMeters: 150,
    breakMinutes: 30,
    status: "PLANNED",
    createdAt: "2026-09-01T00:00:00.000Z",
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
      <ShiftScheduleManager access={access} />
    </QueryClientProvider>,
  );
  return { user };
}

describe("ShiftScheduleManager", () => {
  it("loads an event's shifts once chosen and creates a new one", async () => {
    mockGetRoutes({
      "/api/v1/events": {
        items: [{ id: "event-1", name: "Spring Gala", departmentId: null }],
      },
      "/api/v1/events/{eventId}/shifts": [shift()],
    });
    post.mockResolvedValue(
      ok(shift({ id: "shift-2", label: "Back of house" })),
    );
    const { user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Event" }));
    await user.click(
      await screen.findByRole("option", { name: "Spring Gala" }),
    );

    expect(
      await screen.findByText("Front of house · Main hall"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New shift" }));
    await user.type(
      await screen.findByLabelText("Label (optional)"),
      "Back of house",
    );
    await user.type(screen.getByLabelText("Start"), "2026-09-16T09:00");
    await user.type(screen.getByLabelText("End"), "2026-09-16T17:00");
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "40.7128");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "-74.006");
    await user.click(screen.getByRole("button", { name: "Create shift" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/events/{eventId}/shifts",
        expect.objectContaining({
          body: expect.objectContaining({ label: "Back of house" }),
        }),
      ),
    );
  });

  it("cancels a shift after entering a reason", async () => {
    mockGetRoutes({
      "/api/v1/events": {
        items: [{ id: "event-1", name: "Spring Gala", departmentId: null }],
      },
      "/api/v1/events/{eventId}/shifts": [shift()],
    });
    post.mockResolvedValue(ok(shift({ status: "CANCELLED" })));
    const { user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Event" }));
    await user.click(
      await screen.findByRole("option", { name: "Spring Gala" }),
    );
    await screen.findByText("Front of house · Main hall");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.type(
      await screen.findByLabelText("Reason"),
      "Event postponed by the client.",
    );
    await user.click(screen.getByRole("button", { name: "Cancel shift" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/events/{eventId}/shifts/{shiftId}/cancel",
        expect.objectContaining({
          body: { reason: "Event postponed by the client." },
        }),
      ),
    );
  });
});
