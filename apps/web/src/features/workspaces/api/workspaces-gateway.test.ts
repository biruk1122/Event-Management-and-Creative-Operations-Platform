import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addWorkspaceParticipant,
  assignWorkspaceManager,
  assignWorkspaceTeam,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listAssignableTeams,
  listAssignableUsers,
  listWorkspaces,
  removeWorkspaceParticipant,
  removeWorkspaceTeam,
  WorkspacesRequestError,
} from "./workspaces-gateway";

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: vi.fn(), PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { ok: false, status },
});

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("workspaces gateway reads", () => {
  it("sends the required kind plus the page window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 10, total: 0 }));
    await listWorkspaces({ kind: "CAMPAIGN", page: 2, pageSize: 10 });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/workspaces",
      expect.objectContaining({
        params: { query: { kind: "CAMPAIGN", page: 2, pageSize: 10 } },
        cache: "no-store",
      }),
    );
  });

  it("defaults the page window and forwards a manager filter", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listWorkspaces({ kind: "EVENT", managerId: "u-1" });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({
      kind: "EVENT",
      page: 1,
      pageSize: 25,
      managerId: "u-1",
    });
  });

  it("throws a typed error when the list body is missing", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });
    await expect(listWorkspaces({ kind: "EVENT" })).rejects.toMatchObject({
      name: "WorkspacesRequestError",
      status: 403,
    });
  });

  it("resolves null from getWorkspace on a non-OK response", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });
    expect(await getWorkspace("ws-1")).toBeNull();
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
});

describe("workspaces gateway writes and Problem Details mapping", () => {
  it("creates with a trimmed body and maps a validation failure to field errors", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { managerId: ["must be a UUID"] }),
    );
    const outcome = await createWorkspace({
      kind: "PROJECT",
      managerId: "not-a-uuid",
    });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/workspaces",
      expect.objectContaining({
        body: { kind: "PROJECT", managerId: "not-a-uuid" },
      }),
    );
    expect(outcome).toEqual({
      status: "field_errors",
      fieldErrors: { managerId: "must be a UUID" },
    });
  });

  it("maps a missing manager on create to manager_not_found", async () => {
    post.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    expect(
      await createWorkspace({ kind: "EVENT", managerId: "ghost" }),
    ).toEqual({ status: "manager_not_found" });
  });

  it("maps setManager outcomes", async () => {
    put.mockResolvedValueOnce(fail("USER_NOT_FOUND", 404));
    expect(await assignWorkspaceManager("ws-1", "ghost")).toEqual({
      status: "manager_not_found",
    });
    put.mockResolvedValueOnce(fail("WORKSPACE_NOT_FOUND", 404));
    expect(await assignWorkspaceManager("ws-1", null)).toEqual({
      status: "not_found",
    });
  });

  it("maps team assignment outcomes", async () => {
    put.mockResolvedValueOnce(fail("WORKSPACE_TEAM_NOT_FOUND", 404));
    expect(await assignWorkspaceTeam("ws-1", "ghost")).toEqual({
      status: "team_not_found",
    });
    del.mockResolvedValueOnce(fail("WORKSPACE_TEAM_NOT_ASSIGNED", 409));
    expect(await removeWorkspaceTeam("ws-1", "t-1")).toEqual({
      status: "not_assigned",
    });
  });

  it("maps participant outcomes", async () => {
    put.mockResolvedValueOnce(fail("USER_NOT_FOUND", 404));
    expect(await addWorkspaceParticipant("ws-1", "ghost")).toEqual({
      status: "user_not_found",
    });
    del.mockResolvedValueOnce(fail("WORKSPACE_PARTICIPANT_NOT_FOUND", 409));
    expect(await removeWorkspaceParticipant("ws-1", "u-1")).toEqual({
      status: "not_a_participant",
    });
  });

  it("maps a 204 delete to success and a 403 to permission_denied", async () => {
    del.mockResolvedValueOnce({ response: { ok: true, status: 204 } });
    expect(await deleteWorkspace("ws-1")).toEqual({ status: "success" });
    del.mockResolvedValueOnce(fail("PERMISSION_DENIED", 403));
    expect(await deleteWorkspace("ws-1")).toEqual({
      status: "permission_denied",
    });
  });

  it("sends the CSRF header when the cookie is present", async () => {
    document.cookie = "csrf_token=tok-123; path=/";
    put.mockResolvedValue(ok({ id: "ws-1" }));
    await assignWorkspaceTeam("ws-1", "t-1");
    const [, options] = put.mock.calls[0]!;
    expect(options.headers).toEqual({ "x-csrf-token": "tok-123" });
  });

  it("returns unexpected when the transport throws", async () => {
    post.mockRejectedValue(new Error("network"));
    expect(await createWorkspace({ kind: "EVENT", managerId: null })).toEqual({
      status: "unexpected",
    });
  });
});

describe("WorkspacesRequestError", () => {
  it("phrases the message by status", () => {
    expect(new WorkspacesRequestError(401).message).toMatch(/session expired/i);
    expect(new WorkspacesRequestError(403).message).toMatch(
      /do not have access/i,
    );
    expect(new WorkspacesRequestError(500).message).toMatch(/could not load/i);
  });
});
