import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignUserRole,
  createUser,
  deactivateUser,
  getUser,
  listAssignableRoles,
  listUsers,
  reactivateUser,
  updateUser,
  UsersRequestError,
} from "./users-gateway";
import type { CreateUserValues } from "../lib/users-outcome";

const { get, post, patch, put } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { ok: false, status },
});

const CREATE_VALUES: CreateUserValues = {
  email: "  new@example.com  ",
  firstName: " Ada ",
  lastName: " Lovelace ",
  phone: "",
  profileImage: "",
  temporaryPassword: "temp-password-1",
  roleId: null,
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("users gateway reads", () => {
  it("sends status, search, page, and pageSize to the list endpoint", async () => {
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listUsers({
      status: "ACTIVE",
      search: "  ada  ",
      page: 2,
      pageSize: 10,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/users",
      expect.objectContaining({
        params: {
          query: { page: 2, pageSize: 10, status: "ACTIVE", search: "ada" },
        },
        cache: "no-store",
      }),
    );
  });

  it("omits blank filters and defaults the page window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listUsers({ search: "   " });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("throws a UsersRequestError when the list body is missing", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listUsers({})).rejects.toBeInstanceOf(UsersRequestError);
    await expect(listUsers({})).rejects.toMatchObject({ status: 403 });
  });

  it("resolves null instead of throwing when a single user cannot be read", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 404 },
    });
    await expect(getUser("missing")).resolves.toBeNull();
  });

  it("maps the roles list down to id and name", async () => {
    get.mockResolvedValue(
      ok([
        { id: "r1", name: "Super Admin", description: null, isSystem: true },
        { id: "r2", name: "Team Member", description: "x", isSystem: false },
      ]),
    );
    await expect(listAssignableRoles()).resolves.toEqual([
      { id: "r1", name: "Super Admin" },
      { id: "r2", name: "Team Member" },
    ]);
  });

  it("resolves an empty role list when the caller cannot read roles", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listAssignableRoles()).resolves.toEqual([]);
  });
});

describe("users gateway writes", () => {
  it("echoes the CSRF cookie and trims the create body", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createUser(CREATE_VALUES);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/users",
      expect.objectContaining({
        headers: { "x-csrf-token": "csrf-value" },
        body: {
          email: "new@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
          temporaryPassword: "temp-password-1",
        },
      }),
    );
  });

  it("includes optional profile fields and the role when present", async () => {
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createUser({
      ...CREATE_VALUES,
      phone: " +1 555 ",
      profileImage: " avatars/ada.png ",
      roleId: "role-9",
    });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toMatchObject({
      phone: "+1 555",
      profileImage: "avatars/ada.png",
      roleId: "role-9",
    });
  });

  it("returns the created user on success", async () => {
    post.mockResolvedValue(ok({ id: "new", email: "new@example.com" }, 201));
    await expect(createUser(CREATE_VALUES)).resolves.toEqual({
      status: "success",
      user: { id: "new", email: "new@example.com" },
    });
  });

  it.each([
    ["USER_EMAIL_CONFLICT", 409, "email_conflict"],
    ["ROLE_NOT_FOUND", 404, "role_not_found"],
    ["USER_NOT_FOUND", 404, "not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["CSRF_TOKEN_INVALID", 403, "permission_denied"],
    ["AUTH_UNAUTHENTICATED", 401, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s on create into %s", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(createUser(CREATE_VALUES)).resolves.toEqual({
      status: expected,
    });
  });

  it("maps field-level validation errors onto the inputs", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, [
        { field: "email", messages: ["email must be an email"] },
        { field: "temporaryPassword", messages: ["too short", "second"] },
      ]),
    );
    await expect(createUser(CREATE_VALUES)).resolves.toEqual({
      status: "field_errors",
      fieldErrors: {
        email: "email must be an email",
        temporaryPassword: "too short",
      },
    });
  });

  it("drops blank profile fields from the update body", async () => {
    patch.mockResolvedValue(ok({ id: "u1" }));
    await updateUser("u1", { firstName: "  Grace  ", phone: "" });
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/users/{id}",
      expect.objectContaining({
        params: { path: { id: "u1" } },
        body: { firstName: "Grace" },
      }),
    );
  });

  it("distinguishes an already-inactive user from a missing one on deactivate", async () => {
    post
      .mockResolvedValueOnce(fail("USER_ALREADY_INACTIVE", 409))
      .mockResolvedValueOnce(fail("USER_NOT_FOUND", 404));
    await expect(deactivateUser("u1")).resolves.toEqual({
      status: "already_inactive",
    });
    await expect(deactivateUser("u1")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("maps an already-active user on reactivate", async () => {
    post.mockResolvedValue(fail("USER_ALREADY_ACTIVE", 409));
    await expect(reactivateUser("u1")).resolves.toEqual({
      status: "already_active",
    });
  });

  it("sends the role id (or null) to the assignment endpoint", async () => {
    put.mockResolvedValue(ok({ id: "u1" }));
    await assignUserRole("u1", "role-2");
    await assignUserRole("u1", null);
    expect(put).toHaveBeenNthCalledWith(
      1,
      "/api/v1/users/{id}/role",
      expect.objectContaining({ body: { roleId: "role-2" } }),
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      "/api/v1/users/{id}/role",
      expect.objectContaining({ body: { roleId: null } }),
    );
  });

  it("maps a missing role on assignment", async () => {
    put.mockResolvedValue(fail("ROLE_NOT_FOUND", 404));
    await expect(assignUserRole("u1", "role-x")).resolves.toEqual({
      status: "role_not_found",
    });
  });

  it("returns unexpected when a write throws", async () => {
    post.mockRejectedValue(new Error("network"));
    await expect(createUser(CREATE_VALUES)).resolves.toEqual({
      status: "unexpected",
    });
  });
});
