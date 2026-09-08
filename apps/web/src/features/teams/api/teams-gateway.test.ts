import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addTeamMember,
  assignTeamManager,
  createTeam,
  deactivateTeam,
  deleteTeam,
  getTeam,
  listAssignableDepartments,
  listAssignableManagers,
  listTeams,
  reactivateTeam,
  removeTeamMember,
  updateTeam,
  TeamsRequestError,
} from "./teams-gateway";
import type { CreateTeamValues } from "../lib/teams-outcome";

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
const fail = (code: string, status: number) => ({
  error: { code, status },
  response: { ok: false, status },
});

const CREATE_VALUES: CreateTeamValues = {
  name: "  Production Team  ",
  departmentId: "dep-1",
  description: "",
  managerId: null,
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("teams gateway reads", () => {
  it("sends status, search, departmentId, page, and pageSize to the list endpoint", async () => {
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listTeams({
      status: "INACTIVE",
      search: "  prod  ",
      departmentId: "dep-9",
      page: 2,
      pageSize: 10,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/teams",
      expect.objectContaining({
        params: {
          query: {
            page: 2,
            pageSize: 10,
            status: "INACTIVE",
            search: "prod",
            departmentId: "dep-9",
          },
        },
        cache: "no-store",
      }),
    );
  });

  it("omits blank filters and defaults the page window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listTeams({ search: "   ", departmentId: null });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("throws a TeamsRequestError when the list body is missing", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listTeams({})).rejects.toBeInstanceOf(TeamsRequestError);
    await expect(listTeams({})).rejects.toMatchObject({ status: 403 });
  });

  it("resolves null instead of throwing when a team cannot be read", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(getTeam("missing")).resolves.toBeNull();
  });

  it("maps the users page down to assignable managers", async () => {
    get.mockResolvedValue(
      ok({
        items: [
          {
            id: "u1",
            email: "m@x.com",
            firstName: "Morgan",
            lastName: "Lead",
            status: "ACTIVE",
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    );
    await expect(listAssignableManagers()).resolves.toEqual([
      { id: "u1", email: "m@x.com", firstName: "Morgan", lastName: "Lead" },
    ]);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/users",
      expect.objectContaining({ params: { query: { pageSize: 100 } } }),
    );
  });

  it("maps the departments page down to assignable departments", async () => {
    get.mockResolvedValue(
      ok({
        items: [
          { id: "d1", name: "Production", description: null, manager: null },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    );
    await expect(listAssignableDepartments()).resolves.toEqual([
      { id: "d1", name: "Production" },
    ]);
  });

  it("resolves empty helper lists when the caller cannot read them", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listAssignableManagers()).resolves.toEqual([]);
    await expect(listAssignableDepartments()).resolves.toEqual([]);
  });
});

describe("teams gateway writes", () => {
  it("echoes the CSRF cookie and trims the create body", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createTeam(CREATE_VALUES);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/teams",
      expect.objectContaining({
        headers: { "x-csrf-token": "csrf-value" },
        body: { name: "Production Team", departmentId: "dep-1" },
      }),
    );
  });

  it("includes the description and manager when present", async () => {
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createTeam({
      name: "Event Team",
      departmentId: "dep-2",
      description: "  Runs the calendar.  ",
      managerId: "user-9",
    });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      name: "Event Team",
      departmentId: "dep-2",
      description: "Runs the calendar.",
      managerId: "user-9",
    });
  });

  it("returns the created team on success", async () => {
    post.mockResolvedValue(ok({ id: "new", name: "Production Team" }, 201));
    await expect(createTeam(CREATE_VALUES)).resolves.toEqual({
      status: "success",
      team: { id: "new", name: "Production Team" },
    });
  });

  it.each([
    ["TEAM_NAME_CONFLICT", 409, "name_conflict"],
    ["TEAM_DEPARTMENT_NOT_FOUND", 404, "department_not_found"],
    ["USER_NOT_FOUND", 404, "manager_not_found"],
    ["TEAM_NOT_FOUND", 404, "not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["CSRF_TOKEN_INVALID", 403, "permission_denied"],
    ["AUTH_UNAUTHENTICATED", 401, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s on create into %s", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(createTeam(CREATE_VALUES)).resolves.toEqual({
      status: expected,
    });
  });

  it("maps field-level validation errors onto the inputs", async () => {
    post.mockResolvedValue({
      error: {
        code: "VALIDATION_ERROR",
        status: 400,
        errors: [
          { field: "name", messages: ["name must not be blank"] },
          { field: "departmentId", messages: ["departmentId must be a UUID"] },
        ],
      },
      response: { ok: false, status: 400 },
    });
    await expect(createTeam(CREATE_VALUES)).resolves.toEqual({
      status: "field_errors",
      fieldErrors: {
        name: "name must not be blank",
        departmentId: "departmentId must be a UUID",
      },
    });
  });

  it("drops blank fields from the update body", async () => {
    patch.mockResolvedValue(ok({ id: "t1" }));
    await updateTeam("t1", { name: "  Prod  ", description: "" });
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/teams/{id}",
      expect.objectContaining({
        params: { path: { id: "t1" } },
        body: { name: "Prod" },
      }),
    );
  });

  it("sends the manager id (or null) to the manager endpoint", async () => {
    put.mockResolvedValue(ok({ id: "t1" }));
    await assignTeamManager("t1", "user-2");
    await assignTeamManager("t1", null);
    expect(put).toHaveBeenNthCalledWith(
      1,
      "/api/v1/teams/{id}/manager",
      expect.objectContaining({ body: { managerId: "user-2" } }),
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      "/api/v1/teams/{id}/manager",
      expect.objectContaining({ body: { managerId: null } }),
    );
  });

  it("adds and removes a member by path params", async () => {
    put.mockResolvedValue(ok({ id: "t1" }));
    del.mockResolvedValue(ok({ id: "t1" }));
    await addTeamMember("t1", "u5");
    await removeTeamMember("t1", "u5");
    expect(put).toHaveBeenCalledWith(
      "/api/v1/teams/{id}/members/{userId}",
      expect.objectContaining({ params: { path: { id: "t1", userId: "u5" } } }),
    );
    expect(del).toHaveBeenCalledWith(
      "/api/v1/teams/{id}/members/{userId}",
      expect.objectContaining({ params: { path: { id: "t1", userId: "u5" } } }),
    );
  });

  it("maps membership failures onto their outcomes", async () => {
    put
      .mockResolvedValueOnce(fail("USER_NOT_FOUND", 404))
      .mockResolvedValueOnce(fail("TEAM_NOT_FOUND", 404));
    del.mockResolvedValueOnce(fail("USER_NOT_IN_TEAM", 409));
    await expect(addTeamMember("t1", "u5")).resolves.toEqual({
      status: "user_not_found",
    });
    await expect(addTeamMember("t1", "u5")).resolves.toEqual({
      status: "not_found",
    });
    await expect(removeTeamMember("t1", "u5")).resolves.toEqual({
      status: "not_a_member",
    });
  });

  it("distinguishes an already-inactive team from a missing one", async () => {
    post
      .mockResolvedValueOnce(fail("TEAM_ALREADY_INACTIVE", 409))
      .mockResolvedValueOnce(fail("TEAM_NOT_FOUND", 404));
    await expect(deactivateTeam("t1")).resolves.toEqual({
      status: "already_inactive",
    });
    await expect(deactivateTeam("t1")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("maps an already-active team on reactivate", async () => {
    post.mockResolvedValue(fail("TEAM_ALREADY_ACTIVE", 409));
    await expect(reactivateTeam("t1")).resolves.toEqual({
      status: "already_active",
    });
  });

  it("treats a 204 delete as success and maps in-use / not-found", async () => {
    del
      .mockResolvedValueOnce({ response: { ok: true, status: 204 } })
      .mockResolvedValueOnce(fail("TEAM_IN_USE", 409))
      .mockResolvedValueOnce(fail("TEAM_NOT_FOUND", 404));
    await expect(deleteTeam("t1")).resolves.toEqual({ status: "success" });
    await expect(deleteTeam("t1")).resolves.toEqual({ status: "in_use" });
    await expect(deleteTeam("t1")).resolves.toEqual({ status: "not_found" });
  });

  it("returns unexpected when a write throws", async () => {
    post.mockRejectedValue(new Error("network"));
    await expect(createTeam(CREATE_VALUES)).resolves.toEqual({
      status: "unexpected",
    });
  });
});
