import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignProjectManager,
  assignProjectTeam,
  createProject,
  deleteProject,
  getProject,
  listAssignableEvents,
  listAssignableTeams,
  listAssignableUsers,
  listProjects,
  removeProjectTeam,
  transitionProject,
  updateProject,
} from "./projects-gateway";
import type {
  CreateProjectValues,
  EditProjectValues,
} from "../lib/projects-outcome";

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

const createValues: CreateProjectValues = {
  name: "  Brand Refresh  ",
  description: "  Redesign the visual identity.  ",
  startAt: "2026-10-04T18:00",
  endAt: "",
  eventId: null,
  managerId: null,
};

const editValues: EditProjectValues = {
  name: "Brand",
  description: "",
  startAt: "2026-10-04T18:00",
  endAt: "",
  eventId: "evt-1",
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("projects gateway reads", () => {
  it("sends the page window and forwards active filters", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 10, total: 0 }));
    await listProjects({
      status: "ACTIVE",
      search: "  brand  ",
      eventId: "evt-1",
      managerId: "u1",
      page: 2,
      pageSize: 10,
    });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({
      page: 2,
      pageSize: 10,
      status: "ACTIVE",
      search: "brand",
      eventId: "evt-1",
      managerId: "u1",
    });
  });

  it("omits blank filters and defaults the window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listProjects({ status: null, search: "   " });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("throws a typed error when the list body is missing", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    await expect(listProjects({})).rejects.toMatchObject({
      name: "ProjectsRequestError",
      status: 403,
    });
  });

  it("resolves null from getProject on a non-OK response", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });
    expect(await getProject("prj-1")).toBeNull();
  });

  it("maps assignable users, teams, and events from their list endpoints", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/users")
        return ok({
          items: [{ id: "u1", email: "a@b.c", firstName: "A", lastName: null }],
        });
      if (path === "/api/v1/teams")
        return ok({ items: [{ id: "t1", name: "Design Studio" }] });
      return ok({ items: [{ id: "evt-1", name: "Orbit Launch" }] });
    });
    expect(await listAssignableUsers()).toEqual([
      { id: "u1", email: "a@b.c", firstName: "A", lastName: null },
    ]);
    expect(await listAssignableTeams()).toEqual([
      { id: "t1", name: "Design Studio" },
    ]);
    expect(await listAssignableEvents()).toEqual([
      { id: "evt-1", name: "Orbit Launch" },
    ]);
  });

  it("returns [] for assignable reads the caller cannot make", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    expect(await listAssignableUsers()).toEqual([]);
    expect(await listAssignableTeams()).toEqual([]);
    expect(await listAssignableEvents()).toEqual([]);
  });
});

describe("projects gateway writes", () => {
  it("builds a CreateProjectDto: trims text, drops blanks, converts the schedule to UTC", async () => {
    post.mockResolvedValue(ok({ id: "prj-1" }, 201));
    document.cookie = "csrf_token=tok";
    await createProject(createValues);
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      name: "Brand Refresh",
      description: "Redesign the visual identity.",
      startAt: "2026-10-04T18:00:00.000Z",
    });
    expect(options.headers).toEqual({ "x-csrf-token": "tok" });
  });

  it("includes eventId and managerId when set", async () => {
    post.mockResolvedValue(ok({ id: "prj-1" }, 201));
    await createProject({ ...createValues, eventId: "evt-1", managerId: "u1" });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual(
      expect.objectContaining({ eventId: "evt-1", managerId: "u1" }),
    );
  });

  it("maps create failures by Problem Details code", async () => {
    post.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    expect(await createProject(createValues)).toEqual({
      status: "manager_not_found",
    });

    post.mockResolvedValue(fail("EVENT_NOT_FOUND", 404));
    expect(await createProject(createValues)).toEqual({
      status: "event_not_found",
    });

    post.mockResolvedValue(fail("PROJECT_SCHEDULE_INVALID", 400));
    expect(await createProject(createValues)).toEqual({
      status: "schedule_invalid",
    });

    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { name: "name must not be blank" }),
    );
    expect(await createProject(createValues)).toEqual({
      status: "field_errors",
      fieldErrors: { name: "name must not be blank" },
    });

    post.mockResolvedValue(fail("PERMISSION_DENIED", 403));
    expect(await createProject(createValues)).toEqual({
      status: "permission_denied",
    });
  });

  it("builds an UpdateProjectDto: sends every field, blanking nullable ones to null", async () => {
    patch.mockResolvedValue(ok({ id: "prj-1" }));
    await updateProject("prj-1", editValues);
    const [, options] = patch.mock.calls[0]!;
    expect(options.params).toEqual({ path: { id: "prj-1" } });
    expect(options.body).toEqual({
      name: "Brand",
      description: null,
      startAt: "2026-10-04T18:00:00.000Z",
      endAt: null,
      eventId: "evt-1",
    });
  });

  it("maps an update event-not-found", async () => {
    patch.mockResolvedValue(fail("EVENT_NOT_FOUND", 404));
    expect(await updateProject("prj-1", editValues)).toEqual({
      status: "event_not_found",
    });
  });

  it("maps a transition conflict and a not-found", async () => {
    post.mockResolvedValue(fail("PROJECT_INVALID_TRANSITION", 409));
    expect(await transitionProject("prj-1", "COMPLETED")).toEqual({
      status: "invalid_transition",
    });
    post.mockResolvedValue(fail("PROJECT_NOT_FOUND", 404));
    expect(await transitionProject("prj-1", "ACTIVE")).toEqual({
      status: "not_found",
    });
  });

  it("maps manager and team failures", async () => {
    put.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    expect(await assignProjectManager("prj-1", "ghost")).toEqual({
      status: "manager_not_found",
    });
    put.mockResolvedValue(fail("PROJECT_TEAM_NOT_FOUND", 404));
    expect(await assignProjectTeam("prj-1", "ghost")).toEqual({
      status: "team_not_found",
    });
    del.mockResolvedValue(fail("PROJECT_TEAM_NOT_ASSIGNED", 409));
    expect(await removeProjectTeam("prj-1", "t1")).toEqual({
      status: "not_assigned",
    });
  });

  it("reports delete success from an OK response and maps a not-found", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });
    expect(await deleteProject("prj-1")).toEqual({ status: "success" });
    del.mockResolvedValue(fail("PROJECT_NOT_FOUND", 404));
    expect(await deleteProject("prj-1")).toEqual({ status: "not_found" });
  });

  it("returns unexpected when the client throws", async () => {
    post.mockRejectedValue(new Error("network"));
    expect(await createProject(createValues)).toEqual({
      status: "unexpected",
    });
  });
});
