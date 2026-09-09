import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignEventManager,
  assignEventTeam,
  createEvent,
  deleteEvent,
  getEvent,
  getEventBudget,
  listAssignableTeams,
  listAssignableUsers,
  listEvents,
  removeEventTeam,
  setEventBudget,
  transitionEvent,
  updateEvent,
} from "./events-gateway";
import type { CreateEventValues, EditEventValues } from "../lib/events-outcome";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { ok: false, status },
});

const createValues: CreateEventValues = {
  name: "  Aurora Premiere  ",
  eventType: "FILM_PREMIERE",
  description: "  Opening night.  ",
  startAt: "2026-10-04T18:00",
  endAt: "",
  location: "",
  organizerName: "  City Arts  ",
  managerId: null,
};

const editValues: EditEventValues = {
  name: "Aurora",
  eventType: "CONCERT",
  description: "",
  startAt: "2026-10-04T18:00",
  endAt: "",
  location: "Hall A",
  organizerName: "",
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("events gateway reads", () => {
  it("sends the page window and forwards active filters", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 10, total: 0 }));
    await listEvents({
      status: "READY",
      eventType: "CONCERT",
      search: "  aurora  ",
      page: 2,
      pageSize: 10,
    });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({
      page: 2,
      pageSize: 10,
      status: "READY",
      eventType: "CONCERT",
      search: "aurora",
    });
  });

  it("omits blank filters and defaults the window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listEvents({ status: null, search: "   " });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("throws a typed error when the list body is missing", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    await expect(listEvents({})).rejects.toMatchObject({
      name: "EventsRequestError",
      status: 403,
    });
  });

  it("resolves null from getEvent and getEventBudget on a non-OK response", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });
    expect(await getEvent("evt-1")).toBeNull();
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    expect(await getEventBudget("evt-1")).toBeNull();
  });

  it("maps assignable users and teams from their list endpoints", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/users")
        return ok({
          items: [{ id: "u1", email: "a@b.c", firstName: "A", lastName: null }],
        });
      return ok({ items: [{ id: "t1", name: "Stage Crew" }] });
    });
    expect(await listAssignableUsers()).toEqual([
      { id: "u1", email: "a@b.c", firstName: "A", lastName: null },
    ]);
    expect(await listAssignableTeams()).toEqual([
      { id: "t1", name: "Stage Crew" },
    ]);
  });

  it("returns [] for assignable reads the caller cannot make", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    expect(await listAssignableUsers()).toEqual([]);
    expect(await listAssignableTeams()).toEqual([]);
  });
});

describe("events gateway writes", () => {
  it("builds a CreateEventDto: trims text, drops blanks, converts the schedule to UTC", async () => {
    post.mockResolvedValue(ok({ id: "evt-1" }, 201));
    document.cookie = "csrf_token=tok";
    await createEvent(createValues);
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      name: "Aurora Premiere",
      eventType: "FILM_PREMIERE",
      description: "Opening night.",
      startAt: "2026-10-04T18:00:00.000Z",
      organizerName: "City Arts",
    });
    expect(options.headers).toEqual({ "x-csrf-token": "tok" });
  });

  it("maps create failures by Problem Details code", async () => {
    post.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    expect(await createEvent(createValues)).toEqual({
      status: "manager_not_found",
    });

    post.mockResolvedValue(fail("EVENT_SCHEDULE_INVALID", 400));
    expect(await createEvent(createValues)).toEqual({
      status: "schedule_invalid",
    });

    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { name: "name must not be blank" }),
    );
    expect(await createEvent(createValues)).toEqual({
      status: "field_errors",
      fieldErrors: { name: "name must not be blank" },
    });

    post.mockResolvedValue(fail("PERMISSION_DENIED", 403));
    expect(await createEvent(createValues)).toEqual({
      status: "permission_denied",
    });
  });

  it("builds an UpdateEventDto: sends every field, blanking nullable ones to null", async () => {
    patch.mockResolvedValue(ok({ id: "evt-1" }));
    await updateEvent("evt-1", editValues);
    const [, options] = patch.mock.calls[0]!;
    expect(options.params).toEqual({ path: { id: "evt-1" } });
    expect(options.body).toEqual({
      name: "Aurora",
      eventType: "CONCERT",
      description: null,
      startAt: "2026-10-04T18:00:00.000Z",
      endAt: null,
      location: "Hall A",
      organizerName: null,
    });
  });

  it("maps a transition conflict and a not-found", async () => {
    post.mockResolvedValue(fail("EVENT_INVALID_TRANSITION", 409));
    expect(await transitionEvent("evt-1", "COMPLETED")).toEqual({
      status: "invalid_transition",
    });
    post.mockResolvedValue(fail("EVENT_NOT_FOUND", 404));
    expect(await transitionEvent("evt-1", "READY")).toEqual({
      status: "not_found",
    });
  });

  it("maps manager and team failures", async () => {
    put.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    expect(await assignEventManager("evt-1", "ghost")).toEqual({
      status: "manager_not_found",
    });
    put.mockResolvedValue(fail("EVENT_TEAM_NOT_FOUND", 404));
    expect(await assignEventTeam("evt-1", "ghost")).toEqual({
      status: "team_not_found",
    });
    del.mockResolvedValue(fail("EVENT_TEAM_NOT_ASSIGNED", 409));
    expect(await removeEventTeam("evt-1", "t1")).toEqual({
      status: "not_assigned",
    });
  });

  it("maps budget failures, including an incomplete pair", async () => {
    put.mockResolvedValue(fail("EVENT_BUDGET_INCOMPLETE", 400));
    expect(await setEventBudget("evt-1", 100, null)).toEqual({
      status: "budget_incomplete",
    });
    put.mockResolvedValue(ok({ amount: "100.00", currency: "USD" }));
    expect(await setEventBudget("evt-1", 100, "USD")).toEqual({
      status: "success",
      budget: { amount: "100.00", currency: "USD" },
    });
  });

  it("reports delete success from an OK response and maps a not-found", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    expect(await deleteEvent("evt-1")).toEqual({ status: "success" });
    del.mockResolvedValue(fail("EVENT_NOT_FOUND", 404));
    expect(await deleteEvent("evt-1")).toEqual({ status: "not_found" });
  });

  it("returns unexpected when the client throws", async () => {
    post.mockRejectedValue(new Error("network"));
    expect(await createEvent(createValues)).toEqual({ status: "unexpected" });
  });
});
