import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addGrant,
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  removeGrant,
  updateRole,
} from "./rbac-gateway";
const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: remove },
}));
const failure = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, errors },
  response: { ok: false, status },
});
afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("RBAC gateway", () => {
  it("echoes the CSRF cookie on every write and sends generated request shapes", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    post.mockResolvedValue({
      data: { id: "new" },
      response: { ok: true, status: 201 },
    });
    patch.mockResolvedValue({
      data: { id: "role" },
      response: { ok: true, status: 200 },
    });
    remove.mockResolvedValue({ response: { ok: true, status: 204 } });
    const values = { name: "New name", description: "Description" };
    await createRole(values);
    await updateRole("role", values);
    await deleteRole("role");
    await addGrant("role", "role.read", "SELF");
    await removeGrant("role", "role.read", "SELF");
    for (const mock of [post, patch, remove])
      for (const [, options] of mock.mock.calls)
        expect(options.headers).toEqual({ "x-csrf-token": "csrf-value" });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/roles/{id}/permissions",
      expect.objectContaining({
        body: { permissionKey: "role.read", scope: "SELF" },
      }),
    );
    expect(remove).toHaveBeenCalledWith(
      "/api/v1/roles/{id}/permissions/{permissionKey}/{scope}",
      expect.objectContaining({
        params: {
          path: { id: "role", permissionKey: "role.read", scope: "SELF" },
        },
      }),
    );
  });

  it.each([
    ["ROLE_NAME_CONFLICT", 409, "name_conflict"],
    ["AUTH_UNAUTHENTICATED", 401, "session_expired"],
    ["CSRF_TOKEN_INVALID", 403, "csrf_invalid"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["RATE_LIMITED", 429, "rate_limited"],
    ["ROLE_NOT_FOUND", 404, "role_not_found"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into actionable form state", async (code, status, expected) => {
    post.mockResolvedValue(failure(code, status));
    expect(await createRole({ name: "Draft", description: "" })).toEqual({
      status: expected,
    });
  });

  it("maps description validation separately from name validation", async () => {
    post.mockResolvedValue(
      failure("VALIDATION_ERROR", 400, {
        description: ["Description is too long"],
      }),
    );
    expect(await createRole({ name: "Valid", description: "Long" })).toEqual({
      status: "field_errors",
      fieldErrors: { description: "Description is too long" },
    });
  });

  it.each([
    ["ROLE_IS_SYSTEM", "is_system"],
    ["ROLE_IN_USE", "in_use"],
  ])("maps %s deletion conflicts", async (code, status) => {
    remove.mockResolvedValue(failure(code, 409));
    expect(await deleteRole("role")).toEqual({ status });
  });

  it("distinguishes a removed grant from a deleted role", async () => {
    remove
      .mockResolvedValueOnce(failure("GRANT_NOT_FOUND", 404))
      .mockResolvedValueOnce(failure("ROLE_NOT_FOUND", 404));
    expect(await removeGrant("role", "role.read", "SELF")).toEqual({
      status: "not_found",
    });
    expect(await removeGrant("role", "role.read", "SELF")).toEqual({
      status: "role_not_found",
    });
  });

  it("rejects failed reads instead of substituting fixtures or empty arrays", async () => {
    get.mockResolvedValue(failure("PERMISSION_DENIED", 403));
    await expect(listRoles()).rejects.toThrow("You do not have access");
    await expect(listPermissions()).rejects.toThrow("You do not have access");
    await expect(getRole("role")).rejects.toThrow("You do not have access");
  });
});
