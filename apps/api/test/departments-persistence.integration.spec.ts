import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface ProblemBody {
  code: string;
}

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

describe("department management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  let adminCookies: string[];
  let adminCsrf: string;
  let managerCookies: string[];
  let managerUserId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "dep-persistence-access-token-secret-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "dep-persistence-refresh-token-secret-32-chars";
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

    async function seedUser(email: string, roleName?: string): Promise<string> {
      const role = roleName
        ? await prisma.role.findUniqueOrThrow({ where: { name: roleName } })
        : null;
      const user = await prisma.user.create({
        data: {
          email,
          credential: { create: { passwordHash: credentialHash } },
          ...(role ? { roleAssignment: { create: { roleId: role.id } } } : {}),
        },
      });
      return user.id;
    }
    async function loginAs(email: string): Promise<string[]> {
      const login = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      return setCookies(login);
    }

    await seedUser("persistence-admin@dep.test", "Super Admin");
    adminCookies = await loginAs("persistence-admin@dep.test");
    adminCsrf = cookieValue(adminCookies, "csrf_token");

    managerUserId = await seedUser(
      "persistence-manager@dep.test",
      "Department Manager",
    );
    managerCookies = await loginAs("persistence-manager@dep.test");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  function uniqueName(): string {
    counter += 1;
    return `Persistence Dept ${counter}`;
  }
  function uniqueEmail(): string {
    counter += 1;
    return `persistence-${counter}@dep.test`;
  }

  function post(path: string) {
    return request(http)
      .post(path)
      .set("Cookie", adminCookies)
      .set("x-csrf-token", adminCsrf);
  }
  function put(path: string) {
    return request(http)
      .put(path)
      .set("Cookie", adminCookies)
      .set("x-csrf-token", adminCsrf);
  }
  function del(path: string) {
    return request(http)
      .delete(path)
      .set("Cookie", adminCookies)
      .set("x-csrf-token", adminCsrf);
  }
  function get(path: string) {
    return request(http).get(path).set("Cookie", adminCookies);
  }

  async function createDepartment(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await post("/api/v1/departments").send({
      name: uniqueName(),
      ...overrides,
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }
  async function createUser(): Promise<string> {
    const response = await post("/api/v1/users").send({
      email: uniqueEmail(),
      firstName: "P",
      lastName: "Erson",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("database constraints seen through the API", () => {
    it("clears the manager slot when the manager user is removed", async () => {
      const managerId = await createUser();
      const deptId = await createDepartment({ managerId });

      await db.query(`DELETE FROM users WHERE id = $1`, [managerId]);

      const [row] = await db.query<{ manager_id: string | null }>(
        `SELECT manager_id FROM departments WHERE id = $1`,
        [deptId],
      );
      expect(row?.manager_id).toBeNull();
      const fetched = await get(`/api/v1/departments/${deptId}`).expect(200);
      expect(body<{ manager: unknown }>(fetched).manager).toBeNull();
    });

    it("reports employeeCount from the live users.department_id column", async () => {
      const deptId = await createDepartment();
      const first = await createUser();
      const second = await createUser();

      await db.query(
        `UPDATE users SET department_id = $1 WHERE id = ANY($2::uuid[])`,
        [deptId, [first, second]],
      );
      expect(
        body<{ employeeCount: number }>(
          await get(`/api/v1/departments/${deptId}`).expect(200),
        ).employeeCount,
      ).toBe(2);

      await db.query(`UPDATE users SET department_id = NULL WHERE id = $1`, [
        first,
      ]);
      expect(
        body<{ employeeCount: number }>(
          await get(`/api/v1/departments/${deptId}`).expect(200),
        ).employeeCount,
      ).toBe(1);
    });

    it("enforces name uniqueness at the database and through the API", async () => {
      const name = uniqueName();
      await post("/api/v1/departments").send({ name }).expect(201);

      await expect(
        db.query(`INSERT INTO departments (name) VALUES ($1)`, [name]),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

      const dup = await post("/api/v1/departments").send({ name });
      expect(dup.status).toBe(409);
      expect(body<ProblemBody>(dup).code).toBe("DEPARTMENT_NAME_CONFLICT");
    });

    it("keeps deactivated_at coherent across deactivate and reactivate", async () => {
      const deptId = await createDepartment();

      await post(`/api/v1/departments/${deptId}/deactivate`).expect(200);
      const [off] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM departments WHERE id = $1`,
        [deptId],
      );
      expect(off?.deactivated_at).not.toBeNull();

      await post(`/api/v1/departments/${deptId}/reactivate`).expect(200);
      const [on] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM departments WHERE id = $1`,
        [deptId],
      );
      expect(on?.deactivated_at).toBeNull();
    });
  });

  describe("deletion is all-or-nothing", () => {
    it("refuses to delete a department with an employee, leaving it intact", async () => {
      const deptId = await createDepartment();
      const employeeId = await createUser();
      await put(`/api/v1/departments/${deptId}/employees/${employeeId}`).expect(
        200,
      );

      const blocked = await del(`/api/v1/departments/${deptId}`);
      expect(blocked.status).toBe(409);
      expect(body<ProblemBody>(blocked).code).toBe("DEPARTMENT_IN_USE");

      const [dept] = await db.query<{ id: string }>(
        `SELECT id FROM departments WHERE id = $1`,
        [deptId],
      );
      expect(dept?.id).toBe(deptId);
      const [user] = await db.query<{ department_id: string | null }>(
        `SELECT department_id FROM users WHERE id = $1`,
        [employeeId],
      );
      expect(user?.department_id).toBe(deptId);
    });

    it("deletes an empty department without touching another one", async () => {
      const empty = await createDepartment();
      const populated = await createDepartment();
      const employeeId = await createUser();
      await put(
        `/api/v1/departments/${populated}/employees/${employeeId}`,
      ).expect(200);

      await del(`/api/v1/departments/${empty}`).expect(204);

      expect(
        await prisma.department.findUnique({ where: { id: empty } }),
      ).toBeNull();
      expect(
        await prisma.department.findUnique({ where: { id: populated } }),
      ).not.toBeNull();
      const [user] = await db.query<{ department_id: string | null }>(
        `SELECT department_id FROM users WHERE id = $1`,
        [employeeId],
      );
      expect(user?.department_id).toBe(populated);
    });

    it("leaves no dangling reference when assign and delete race", async () => {
      const deptId = await createDepartment();
      const employeeId = await createUser();

      const [assign, remove] = await Promise.all([
        put(`/api/v1/departments/${deptId}/employees/${employeeId}`),
        del(`/api/v1/departments/${deptId}`),
      ]);

      // Neither request may 500, whatever the interleaving. The assign either
      // lands (200) or finds the department already gone (404); the delete
      // either succeeds (204) or is refused because the assign landed first
      // (409).
      for (const status of [assign.status, remove.status]) {
        expect(status).toBeLessThan(500);
      }
      expect([200, 404]).toContain(assign.status);
      expect([204, 409]).toContain(remove.status);

      const [dept] = await db.query<{ id: string }>(
        `SELECT id FROM departments WHERE id = $1`,
        [deptId],
      );
      const [user] = await db.query<{ department_id: string | null }>(
        `SELECT department_id FROM users WHERE id = $1`,
        [employeeId],
      );
      if (dept) {
        // Department survived: the delete was refused and the assign landed.
        expect(remove.status).toBe(409);
        expect(user?.department_id).toBe(deptId);
      } else {
        // Department gone: the FK `SET NULL` left the member pointing at
        // nothing, whichever request observed the deletion.
        expect(remove.status).toBe(204);
        expect(user?.department_id).toBeNull();
      }
    });
  });

  describe("state transitions and live scope", () => {
    it("tolerates two simultaneous deactivations and converges to inactive", async () => {
      const deptId = await createDepartment();

      const [first, second] = await Promise.all([
        post(`/api/v1/departments/${deptId}/deactivate`),
        post(`/api/v1/departments/${deptId}/deactivate`),
      ]);

      const statuses = [first.status, second.status];
      expect(
        statuses.filter((code) => code === 200).length,
      ).toBeGreaterThanOrEqual(1);
      expect(statuses.every((code) => code === 200 || code === 409)).toBe(true);

      const [row] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM departments WHERE id = $1`,
        [deptId],
      );
      expect(row?.deactivated_at).not.toBeNull();
    });

    it("follows a Department Manager's department_id on their next request", async () => {
      const deptId = await createDepartment();

      const before = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", managerCookies)
        .expect(200);
      expect(body<{ items: unknown[] }>(before).items).toHaveLength(0);

      await db.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [
        deptId,
        managerUserId,
      ]);
      const during = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", managerCookies)
        .expect(200);
      const items = body<{ items: { id: string }[] }>(during).items;
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe(deptId);

      await db.query(`UPDATE users SET department_id = NULL WHERE id = $1`, [
        managerUserId,
      ]);
      const after = await request(http)
        .get("/api/v1/departments")
        .set("Cookie", managerCookies)
        .expect(200);
      expect(body<{ items: unknown[] }>(after).items).toHaveLength(0);
    });

    it("maps assignment to a just-deleted department as DEPARTMENT_NOT_FOUND", async () => {
      const deptId = await createDepartment();
      const employeeId = await createUser();
      await del(`/api/v1/departments/${deptId}`).expect(204);

      const response = await put(
        `/api/v1/departments/${deptId}/employees/${employeeId}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("DEPARTMENT_NOT_FOUND");
      expect(
        await prisma.user.findUnique({ where: { id: employeeId } }),
      ).toMatchObject({ departmentId: null });
    });

    it("the create transaction writes nothing when the manager FK is bad", async () => {
      const name = uniqueName();

      const response = await post("/api/v1/departments").send({
        name,
        managerId: MISSING_UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(
        await prisma.department.findUnique({ where: { name } }),
      ).toBeNull();
    });
  });
});
