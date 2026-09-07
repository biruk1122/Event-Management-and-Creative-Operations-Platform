import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const UUID = "00000000-0000-0000-0000-000000000000";

interface Principal {
  cookies: string[];
  csrfToken: string;
}

interface ProblemBody {
  code: string;
}

interface DepartmentBody {
  id: string;
  name: string;
  description: string | null;
  manager: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  employeeCount: number;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: DepartmentBody[];
  page: number;
  pageSize: number;
  total: number;
}

const DEPARTMENT_KEYS = [
  "createdAt",
  "deactivatedAt",
  "description",
  "employeeCount",
  "id",
  "manager",
  "name",
  "updatedAt",
].sort();

function body<T>(response: request.Response): T {
  return response.body as T;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const header = setCookie.find((entry) => entry.startsWith(`${name}=`));
  const value = header?.slice(name.length + 1).split(";")[0];
  if (!value) {
    throw new Error(`cookie ${name} not present`);
  }
  return value;
}

describe("department management API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let plainUser: Principal;
  let plainUserId: string;
  let deptManager: Principal;
  let deptManagerId: string;
  let credentialHash: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "dep-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "dep-refresh-token-secret-at-least-32-characters";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);

    const [{ Test }, appModule, appSetup, hasherModule] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);
    credentialHash = await new hasherModule.PasswordHasher().hash(PASSWORD);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function seedUser(
      email: string,
      data: Record<string, unknown> = {},
    ): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email,
          credential: { create: { passwordHash: credentialHash } },
          ...data,
        },
      });
      return user.id;
    }
    async function assignRole(userId: string, roleName: string): Promise<void> {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.userRoleAssignment.create({
        data: { userId, roleId: role.id },
      });
    }
    async function loginAs(email: string): Promise<Principal> {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }

    const superAdminId = await seedUser("super-admin@dep.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@dep.test");

    plainUserId = await seedUser("plain@dep.test");
    plainUser = await loginAs("plain@dep.test");

    deptManagerId = await seedUser("dept-manager@dep.test");
    await assignRole(deptManagerId, "Department Manager");
    deptManager = await loginAs("dept-manager@dep.test");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function asAdmin(
    method: "get" | "post" | "patch" | "put" | "delete",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", superAdmin.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", superAdmin.csrfToken);
  }

  async function createDepartment(
    overrides: Record<string, unknown> = {},
  ): Promise<DepartmentBody> {
    const response = await asAdmin("post", "/api/v1/departments").send({
      name: `Dept ${Math.random().toString(36).slice(2)}`,
      ...overrides,
    });
    expect(response.status).toBe(201);
    return body<DepartmentBody>(response);
  }

  describe("authentication and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await request(http).get("/api/v1/departments")).status).toBe(401);
    });

    it("rejects a reader without department.read", async () => {
      const response = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", plainUser.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("rejects a create without department.create and writes nothing", async () => {
      const response = await request(http)
        .post("/api/v1/departments")
        .set("Cookie", plainUser.cookies)
        .set("x-csrf-token", plainUser.csrfToken)
        .send({ name: "Forbidden Dept" });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      expect(
        await prisma.department.findUnique({
          where: { name: "Forbidden Dept" },
        }),
      ).toBeNull();
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/departments")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No Csrf Dept" });
      expect(response.status).toBe(403);
    });
  });

  describe("create, read, and list", () => {
    it("creates a department and returns only the public contract", async () => {
      const manager = await asAdmin("post", "/api/v1/users").send({
        email: "mgr@dep.test",
        firstName: "Morgan",
        lastName: "Lead",
        temporaryPassword: "temp-password-123",
      });
      const response = await asAdmin("post", "/api/v1/departments").send({
        name: "  Event Management  ",
        description: "  Owns events.  ",
        managerId: body<{ id: string }>(manager).id,
      });
      expect(response.status).toBe(201);
      const created = body<DepartmentBody>(response);

      expect(created.name).toBe("Event Management");
      expect(created.description).toBe("Owns events.");
      expect(created.manager).toMatchObject({
        email: "mgr@dep.test",
        firstName: "Morgan",
      });
      expect(created.employeeCount).toBe(0);
      expect(created.deactivatedAt).toBeNull();
      expect(Object.keys(created).sort()).toEqual(DEPARTMENT_KEYS);
    });

    it("409s a duplicate name", async () => {
      await createDepartment({ name: "Production" });
      const response = await asAdmin("post", "/api/v1/departments").send({
        name: "Production",
      });
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("DEPARTMENT_NAME_CONFLICT");
    });

    it("404s an unknown manager and writes nothing", async () => {
      const response = await asAdmin("post", "/api/v1/departments").send({
        name: "Ghost Manager Dept",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(
        await prisma.department.findUnique({
          where: { name: "Ghost Manager Dept" },
        }),
      ).toBeNull();
    });

    it("rejects a blank name with VALIDATION_ERROR", async () => {
      const response = await asAdmin("post", "/api/v1/departments").send({
        name: "",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("gets one department and 404s an unknown id", async () => {
      const created = await createDepartment();
      const found = await asAdmin("get", `/api/v1/departments/${created.id}`);
      expect(found.status).toBe(200);
      expect(body<DepartmentBody>(found).id).toBe(created.id);

      const missing = await asAdmin("get", `/api/v1/departments/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("DEPARTMENT_NOT_FOUND");
    });

    it("paginates and filters the list", async () => {
      const page = await asAdmin(
        "get",
        "/api/v1/departments?page=1&pageSize=2",
      );
      expect(page.status).toBe(200);
      const pageBody = body<PageBody>(page);
      expect(pageBody.pageSize).toBe(2);
      expect(pageBody.items.length).toBeLessThanOrEqual(2);
      expect(pageBody.total).toBeGreaterThan(0);
    });
  });

  describe("update, manager, and deactivation", () => {
    it("updates name and description", async () => {
      const created = await createDepartment();
      const response = await asAdmin(
        "patch",
        `/api/v1/departments/${created.id}`,
      ).send({ description: "Revised." });
      expect(response.status).toBe(200);
      expect(body<DepartmentBody>(response).description).toBe("Revised.");
    });

    it("sets and clears the manager", async () => {
      const created = await createDepartment();
      const set = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/manager`,
      ).send({ managerId: plainUserId });
      expect(set.status).toBe(200);
      expect(body<DepartmentBody>(set).manager?.id).toBe(plainUserId);

      const cleared = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<DepartmentBody>(cleared).manager).toBeNull();
    });

    it("404s setting a manager that is not a real user", async () => {
      const created = await createDepartment();
      const response = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
    });

    it("deactivates and reactivates, rejecting a repeat of either", async () => {
      const created = await createDepartment();

      const off = await asAdmin(
        "post",
        `/api/v1/departments/${created.id}/deactivate`,
      );
      expect(off.status).toBe(200);
      expect(body<DepartmentBody>(off).deactivatedAt).not.toBeNull();

      const offAgain = await asAdmin(
        "post",
        `/api/v1/departments/${created.id}/deactivate`,
      );
      expect(offAgain.status).toBe(409);
      expect(body<ProblemBody>(offAgain).code).toBe(
        "DEPARTMENT_ALREADY_INACTIVE",
      );

      const on = await asAdmin(
        "post",
        `/api/v1/departments/${created.id}/reactivate`,
      );
      expect(on.status).toBe(200);
      expect(body<DepartmentBody>(on).deactivatedAt).toBeNull();

      const onAgain = await asAdmin(
        "post",
        `/api/v1/departments/${created.id}/reactivate`,
      );
      expect(onAgain.status).toBe(409);
      expect(body<ProblemBody>(onAgain).code).toBe("DEPARTMENT_ALREADY_ACTIVE");
    });
  });

  describe("employees and deletion", () => {
    it("assigns an employee, blocks deletion, then frees and deletes", async () => {
      const created = await createDepartment();
      const employee = await asAdmin("post", "/api/v1/users").send({
        email: `emp-${Math.random().toString(36).slice(2)}@dep.test`,
        firstName: "Ed",
        lastName: "Employee",
        temporaryPassword: "temp-password-123",
      });
      const employeeId = body<{ id: string }>(employee).id;

      const assigned = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/employees/${employeeId}`,
      );
      expect(assigned.status).toBe(200);
      expect(body<DepartmentBody>(assigned).employeeCount).toBe(1);

      const blocked = await asAdmin(
        "delete",
        `/api/v1/departments/${created.id}`,
      );
      expect(blocked.status).toBe(409);
      expect(body<ProblemBody>(blocked).code).toBe("DEPARTMENT_IN_USE");

      const removed = await asAdmin(
        "delete",
        `/api/v1/departments/${created.id}/employees/${employeeId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<DepartmentBody>(removed).employeeCount).toBe(0);

      const deleted = await asAdmin(
        "delete",
        `/api/v1/departments/${created.id}`,
      );
      expect(deleted.status).toBe(204);
      expect(
        await prisma.department.findUnique({ where: { id: created.id } }),
      ).toBeNull();
    });

    it("409s removing a user that is not in the department", async () => {
      const created = await createDepartment();
      const response = await asAdmin(
        "delete",
        `/api/v1/departments/${created.id}/employees/${plainUserId}`,
      );
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_IN_DEPARTMENT");
    });

    it("404s a delete for an unknown department", async () => {
      const response = await asAdmin("delete", `/api/v1/departments/${UUID}`);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("DEPARTMENT_NOT_FOUND");
    });
  });

  describe("scoped visibility", () => {
    it("limits a Department Manager to their own department", async () => {
      const own = await createDepartment({ name: "Manager Home Dept" });
      const other = await createDepartment({ name: "Someone Elses Dept" });
      await prisma.user.update({
        where: { id: deptManagerId },
        data: { departmentId: own.id },
      });

      const list = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", deptManager.cookies);
      expect(list.status).toBe(200);
      const items = body<PageBody>(list).items;
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe(own.id);

      const ownGet = await request(http)
        .get(`/api/v1/departments/${own.id}`)
        .set("Cookie", deptManager.cookies);
      expect(ownGet.status).toBe(200);

      const otherGet = await request(http)
        .get(`/api/v1/departments/${other.id}`)
        .set("Cookie", deptManager.cookies);
      expect(otherGet.status).toBe(403);
      expect(body<ProblemBody>(otherGet).code).toBe("PERMISSION_DENIED");
    });

    it("returns an empty page for a Department Manager with no department", async () => {
      await prisma.user.update({
        where: { id: deptManagerId },
        data: { departmentId: null },
      });
      const list = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", deptManager.cookies);
      expect(list.status).toBe(200);
      expect(body<PageBody>(list).items).toHaveLength(0);
    });
  });

  describe("request validation", () => {
    it.each([
      ["a name over 120 characters", { name: "x".repeat(121) }],
      ["a description over 1000 characters", { description: "y".repeat(1001) }],
      ["a manager id that is not a uuid", { name: "V", managerId: "not-uuid" }],
      ["a whitespace-only name", { name: "   " }],
      ["a blank description", { name: "V", description: " " }],
    ])("400s %s with VALIDATION_ERROR", async (_label, payload) => {
      const response = await asAdmin("post", "/api/v1/departments").send({
        name: "Valid Name",
        ...payload,
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("400s an unknown status filter and an over-large pageSize", async () => {
      expect(
        (await asAdmin("get", "/api/v1/departments?status=BOGUS")).status,
      ).toBe(400);
      expect(
        (await asAdmin("get", "/api/v1/departments?pageSize=101")).status,
      ).toBe(400);
    });

    it("requires an explicit managerId on the manager route", async () => {
      const created = await createDepartment();
      const response = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/manager`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("granular authorization", () => {
    let readerCookies: string[];

    it("allows a reader with only department.read to list but not create", async () => {
      const role = await prisma.role.create({
        data: { name: `Dept Reader ${Math.random().toString(36).slice(2)}` },
      });
      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionKey: "department.read",
          scope: "ORGANIZATION",
        },
      });
      const email = `reader-${Math.random().toString(36).slice(2)}@dep.test`;
      await prisma.user.create({
        data: {
          email,
          credential: { create: { passwordHash: credentialHash } },
          roleAssignment: { create: { roleId: role.id } },
        },
      });
      const login = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      readerCookies = setCookies(login);

      expect(
        (
          await request(http)
            .get("/api/v1/departments")
            .set("Cookie", readerCookies)
        ).status,
      ).toBe(200);

      const csrf = cookieValue(readerCookies, "csrf_token");
      const create = await request(http)
        .post("/api/v1/departments")
        .set("Cookie", readerCookies)
        .set("x-csrf-token", csrf)
        .send({ name: "Reader Cannot Create" });
      expect(create.status).toBe(403);
      expect(body<ProblemBody>(create).code).toBe("PERMISSION_DENIED");
      expect(
        await prisma.department.findUnique({
          where: { name: "Reader Cannot Create" },
        }),
      ).toBeNull();
    });
  });

  describe("more transport cases", () => {
    it("rejects manager and delete mutations missing the CSRF header", async () => {
      const created = await createDepartment();
      expect(
        (
          await request(http)
            .put(`/api/v1/departments/${created.id}/manager`)
            .set("Cookie", superAdmin.cookies)
            .send({ managerId: null })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(http)
            .delete(`/api/v1/departments/${created.id}`)
            .set("Cookie", superAdmin.cookies)
        ).status,
      ).toBe(403);
    });

    it("404s employee assignment for an unknown department or user", async () => {
      const created = await createDepartment();
      const unknownDept = await asAdmin(
        "put",
        `/api/v1/departments/${UUID}/employees/${plainUserId}`,
      );
      expect(unknownDept.status).toBe(404);
      expect(body<ProblemBody>(unknownDept).code).toBe("DEPARTMENT_NOT_FOUND");

      const unknownUser = await asAdmin(
        "put",
        `/api/v1/departments/${created.id}/employees/${UUID}`,
      );
      expect(unknownUser.status).toBe(404);
      expect(body<ProblemBody>(unknownUser).code).toBe("USER_NOT_FOUND");
    });

    it("409s a PATCH that renames onto an existing name", async () => {
      const taken = await createDepartment({ name: "Already Taken" });
      const other = await createDepartment();
      const response = await asAdmin(
        "patch",
        `/api/v1/departments/${other.id}`,
      ).send({ name: taken.name });
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("DEPARTMENT_NAME_CONFLICT");
    });

    it("treats an empty PATCH as a no-op that returns the current row", async () => {
      const created = await createDepartment({ description: "Keep me." });
      const response = await asAdmin(
        "patch",
        `/api/v1/departments/${created.id}`,
      ).send({});
      expect(response.status).toBe(200);
      expect(body<DepartmentBody>(response).description).toBe("Keep me.");
    });

    it("returns only the public contract from get and list", async () => {
      const created = await createDepartment();
      const one = await asAdmin("get", `/api/v1/departments/${created.id}`);
      expect(Object.keys(body<DepartmentBody>(one)).sort()).toEqual(
        DEPARTMENT_KEYS,
      );
      const page = await asAdmin("get", "/api/v1/departments?pageSize=1");
      expect(Object.keys(body<PageBody>(page).items[0]!).sort()).toEqual(
        DEPARTMENT_KEYS,
      );
    });

    it("echoes the incoming x-request-id", async () => {
      const response = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", superAdmin.cookies)
        .set("x-request-id", "dep-req-id-check");
      expect(response.headers["x-request-id"]).toBe("dep-req-id-check");
    });
  });
});
