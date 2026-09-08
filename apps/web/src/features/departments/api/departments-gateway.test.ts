import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignDepartmentManager,
  createDepartment,
  deactivateDepartment,
  deleteDepartment,
  getDepartment,
  listAssignableManagers,
  listDepartments,
  reactivateDepartment,
  updateDepartment,
  DepartmentsRequestError,
} from "./departments-gateway";
import type { CreateDepartmentValues } from "../lib/departments-outcome";

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

const CREATE_VALUES: CreateDepartmentValues = {
  name: "  Event Management  ",
  description: "",
  managerId: null,
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("departments gateway reads", () => {
  it("sends status, search, page, and pageSize to the list endpoint", async () => {
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listDepartments({
      status: "INACTIVE",
      search: "  prod  ",
      page: 2,
      pageSize: 10,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/departments",
      expect.objectContaining({
        params: {
          query: { page: 2, pageSize: 10, status: "INACTIVE", search: "prod" },
        },
        cache: "no-store",
      }),
    );
  });

  it("omits blank filters and defaults the page window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listDepartments({ search: "   " });
    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("throws a DepartmentsRequestError when the list body is missing", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listDepartments({})).rejects.toBeInstanceOf(
      DepartmentsRequestError,
    );
    await expect(listDepartments({})).rejects.toMatchObject({ status: 403 });
  });

  it("resolves null instead of throwing when a department cannot be read", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(getDepartment("missing")).resolves.toBeNull();
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

  it("resolves an empty manager list when the caller cannot read users", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listAssignableManagers()).resolves.toEqual([]);
  });
});

describe("departments gateway writes", () => {
  it("echoes the CSRF cookie and trims the create body", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createDepartment(CREATE_VALUES);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/departments",
      expect.objectContaining({
        headers: { "x-csrf-token": "csrf-value" },
        body: { name: "Event Management" },
      }),
    );
  });

  it("includes the description and manager when present", async () => {
    post.mockResolvedValue(ok({ id: "new" }, 201));
    await createDepartment({
      name: "Production",
      description: "  Runs delivery.  ",
      managerId: "user-9",
    });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      name: "Production",
      description: "Runs delivery.",
      managerId: "user-9",
    });
  });

  it("returns the created department on success", async () => {
    post.mockResolvedValue(ok({ id: "new", name: "Event Management" }, 201));
    await expect(createDepartment(CREATE_VALUES)).resolves.toEqual({
      status: "success",
      department: { id: "new", name: "Event Management" },
    });
  });

  it.each([
    ["DEPARTMENT_NAME_CONFLICT", 409, "name_conflict"],
    ["USER_NOT_FOUND", 404, "manager_not_found"],
    ["DEPARTMENT_NOT_FOUND", 404, "not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["CSRF_TOKEN_INVALID", 403, "permission_denied"],
    ["AUTH_UNAUTHENTICATED", 401, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s on create into %s", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(createDepartment(CREATE_VALUES)).resolves.toEqual({
      status: expected,
    });
  });

  it("maps field-level validation errors onto the inputs", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, [
        { field: "name", messages: ["name must not be blank"] },
        { field: "description", messages: ["too long"] },
      ]),
    );
    await expect(createDepartment(CREATE_VALUES)).resolves.toEqual({
      status: "field_errors",
      fieldErrors: {
        name: "name must not be blank",
        description: "too long",
      },
    });
  });

  it("drops blank fields from the update body", async () => {
    patch.mockResolvedValue(ok({ id: "d1" }));
    await updateDepartment("d1", { name: "  Events  ", description: "" });
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/departments/{id}",
      expect.objectContaining({
        params: { path: { id: "d1" } },
        body: { name: "Events" },
      }),
    );
  });

  it("sends the manager id (or null) to the manager endpoint", async () => {
    put.mockResolvedValue(ok({ id: "d1" }));
    await assignDepartmentManager("d1", "user-2");
    await assignDepartmentManager("d1", null);
    expect(put).toHaveBeenNthCalledWith(
      1,
      "/api/v1/departments/{id}/manager",
      expect.objectContaining({ body: { managerId: "user-2" } }),
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      "/api/v1/departments/{id}/manager",
      expect.objectContaining({ body: { managerId: null } }),
    );
  });

  it("maps a missing manager user on assignment", async () => {
    put.mockResolvedValue(fail("USER_NOT_FOUND", 404));
    await expect(assignDepartmentManager("d1", "user-x")).resolves.toEqual({
      status: "manager_not_found",
    });
  });

  it("distinguishes an already-inactive department from a missing one", async () => {
    post
      .mockResolvedValueOnce(fail("DEPARTMENT_ALREADY_INACTIVE", 409))
      .mockResolvedValueOnce(fail("DEPARTMENT_NOT_FOUND", 404));
    await expect(deactivateDepartment("d1")).resolves.toEqual({
      status: "already_inactive",
    });
    await expect(deactivateDepartment("d1")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("maps an already-active department on reactivate", async () => {
    post.mockResolvedValue(fail("DEPARTMENT_ALREADY_ACTIVE", 409));
    await expect(reactivateDepartment("d1")).resolves.toEqual({
      status: "already_active",
    });
  });

  it("treats a 204 delete as success and maps in-use / not-found", async () => {
    del
      .mockResolvedValueOnce({ response: { ok: true, status: 204 } })
      .mockResolvedValueOnce(fail("DEPARTMENT_IN_USE", 409))
      .mockResolvedValueOnce(fail("DEPARTMENT_NOT_FOUND", 404));
    await expect(deleteDepartment("d1")).resolves.toEqual({
      status: "success",
    });
    await expect(deleteDepartment("d1")).resolves.toEqual({ status: "in_use" });
    await expect(deleteDepartment("d1")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("returns unexpected when a write throws", async () => {
    post.mockRejectedValue(new Error("network"));
    await expect(createDepartment(CREATE_VALUES)).resolves.toEqual({
      status: "unexpected",
    });
  });
});
