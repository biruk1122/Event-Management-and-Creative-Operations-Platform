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

interface TeamBody {
  id: string;
  name: string;
  description: string | null;
  department: { id: string; name: string };
  manager: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  members: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: TeamBody[];
  page: number;
  pageSize: number;
  total: number;
}

const TEAM_KEYS = [
  "createdAt",
  "deactivatedAt",
  "department",
  "description",
  "id",
  "manager",
  "members",
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

describe("team management API", () => {
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

  let homeDepartmentId: string;
  let otherDepartmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "team-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "team-refresh-token-secret-at-least-32-characters";
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

    async function seedUser(email: string): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email,
          credential: { create: { passwordHash: credentialHash } },
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

    const superAdminId = await seedUser("super-admin@team.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@team.test");

    plainUserId = await seedUser("plain@team.test");
    plainUser = await loginAs("plain@team.test");

    deptManagerId = await seedUser("dept-manager@team.test");
    await assignRole(deptManagerId, "Department Manager");
    deptManager = await loginAs("dept-manager@team.test");

    const home = await prisma.department.create({
      data: { name: "Home Department" },
    });
    const other = await prisma.department.create({
      data: { name: "Other Department" },
    });
    homeDepartmentId = home.id;
    otherDepartmentId = other.id;
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

  async function createTeam(
    overrides: Record<string, unknown> = {},
  ): Promise<TeamBody> {
    const response = await asAdmin("post", "/api/v1/teams").send({
      name: `Team ${Math.random().toString(36).slice(2)}`,
      departmentId: homeDepartmentId,
      ...overrides,
    });
    expect(response.status).toBe(201);
    return body<TeamBody>(response);
  }

  async function createUser(): Promise<string> {
    const response = await asAdmin("post", "/api/v1/users").send({
      email: `member-${Math.random().toString(36).slice(2)}@team.test`,
      firstName: "Mem",
      lastName: "Ber",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("authentication and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await request(http).get("/api/v1/teams")).status).toBe(401);
    });

    it("rejects a reader without team.read", async () => {
      const response = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", plainUser.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("rejects a create without team.create and writes nothing", async () => {
      const response = await request(http)
        .post("/api/v1/teams")
        .set("Cookie", plainUser.cookies)
        .set("x-csrf-token", plainUser.csrfToken)
        .send({ name: "Forbidden Team", departmentId: homeDepartmentId });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      expect(
        await prisma.team.findFirst({ where: { name: "Forbidden Team" } }),
      ).toBeNull();
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/teams")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No Csrf Team", departmentId: homeDepartmentId });
      expect(response.status).toBe(403);
    });
  });

  describe("create, read, and list", () => {
    it("creates a team and returns only the public contract", async () => {
      const managerResponse = await asAdmin("post", "/api/v1/users").send({
        email: "team-mgr@team.test",
        firstName: "Morgan",
        lastName: "Lead",
        temporaryPassword: "temp-password-123",
      });
      const response = await asAdmin("post", "/api/v1/teams").send({
        name: "  Production Team  ",
        departmentId: homeDepartmentId,
        description: "  Delivers production.  ",
        managerId: body<{ id: string }>(managerResponse).id,
      });
      expect(response.status).toBe(201);
      const created = body<TeamBody>(response);

      expect(created.name).toBe("Production Team");
      expect(created.description).toBe("Delivers production.");
      expect(created.department).toEqual({
        id: homeDepartmentId,
        name: "Home Department",
      });
      expect(created.manager).toMatchObject({
        email: "team-mgr@team.test",
        firstName: "Morgan",
      });
      expect(created.members).toEqual([]);
      expect(created.deactivatedAt).toBeNull();
      expect(Object.keys(created).sort()).toEqual(TEAM_KEYS);
    });

    it("409s a duplicate name in the same department but allows it in another", async () => {
      await createTeam({ name: "Delivery" });

      const dup = await asAdmin("post", "/api/v1/teams").send({
        name: "Delivery",
        departmentId: homeDepartmentId,
      });
      expect(dup.status).toBe(409);
      expect(body<ProblemBody>(dup).code).toBe("TEAM_NAME_CONFLICT");

      const elsewhere = await asAdmin("post", "/api/v1/teams").send({
        name: "Delivery",
        departmentId: otherDepartmentId,
      });
      expect(elsewhere.status).toBe(201);
    });

    it("404s an unknown owning department and writes nothing", async () => {
      const response = await asAdmin("post", "/api/v1/teams").send({
        name: "Ghost Dept Team",
        departmentId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe(
        "TEAM_DEPARTMENT_NOT_FOUND",
      );
      expect(
        await prisma.team.findFirst({ where: { name: "Ghost Dept Team" } }),
      ).toBeNull();
    });

    it("404s an unknown manager and writes nothing", async () => {
      const response = await asAdmin("post", "/api/v1/teams").send({
        name: "Ghost Manager Team",
        departmentId: homeDepartmentId,
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(
        await prisma.team.findFirst({ where: { name: "Ghost Manager Team" } }),
      ).toBeNull();
    });

    it("gets one team and 404s an unknown id", async () => {
      const created = await createTeam();
      const found = await asAdmin("get", `/api/v1/teams/${created.id}`);
      expect(found.status).toBe(200);
      expect(body<TeamBody>(found).id).toBe(created.id);

      const missing = await asAdmin("get", `/api/v1/teams/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("TEAM_NOT_FOUND");
    });

    it("paginates and filters the list by department", async () => {
      await createTeam({ departmentId: otherDepartmentId });
      const page = await asAdmin(
        "get",
        `/api/v1/teams?departmentId=${otherDepartmentId}&pageSize=50`,
      );
      expect(page.status).toBe(200);
      const pageBody = body<PageBody>(page);
      expect(pageBody.items.length).toBeGreaterThan(0);
      expect(
        pageBody.items.every(
          (team) => team.department.id === otherDepartmentId,
        ),
      ).toBe(true);
    });
  });

  describe("update, manager, and deactivation", () => {
    it("updates name and description", async () => {
      const created = await createTeam();
      const response = await asAdmin(
        "patch",
        `/api/v1/teams/${created.id}`,
      ).send({ description: "Revised." });
      expect(response.status).toBe(200);
      expect(body<TeamBody>(response).description).toBe("Revised.");
    });

    it("409s a PATCH that renames onto an existing name in the department", async () => {
      const taken = await createTeam({ name: "Already Taken" });
      const other = await createTeam();
      const response = await asAdmin("patch", `/api/v1/teams/${other.id}`).send(
        { name: taken.name },
      );
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("TEAM_NAME_CONFLICT");
    });

    it("sets and clears the manager, 404ing an unknown user", async () => {
      const created = await createTeam();
      const set = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/manager`,
      ).send({ managerId: plainUserId });
      expect(set.status).toBe(200);
      expect(body<TeamBody>(set).manager?.id).toBe(plainUserId);

      const cleared = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<TeamBody>(cleared).manager).toBeNull();

      const ghost = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");
    });

    it("deactivates and reactivates, rejecting a repeat of either", async () => {
      const created = await createTeam();

      const off = await asAdmin(
        "post",
        `/api/v1/teams/${created.id}/deactivate`,
      );
      expect(off.status).toBe(200);
      expect(body<TeamBody>(off).deactivatedAt).not.toBeNull();

      const offAgain = await asAdmin(
        "post",
        `/api/v1/teams/${created.id}/deactivate`,
      );
      expect(offAgain.status).toBe(409);
      expect(body<ProblemBody>(offAgain).code).toBe("TEAM_ALREADY_INACTIVE");

      const on = await asAdmin(
        "post",
        `/api/v1/teams/${created.id}/reactivate`,
      );
      expect(on.status).toBe(200);
      expect(body<TeamBody>(on).deactivatedAt).toBeNull();

      const onAgain = await asAdmin(
        "post",
        `/api/v1/teams/${created.id}/reactivate`,
      );
      expect(onAgain.status).toBe(409);
      expect(body<ProblemBody>(onAgain).code).toBe("TEAM_ALREADY_ACTIVE");
    });
  });

  describe("members and deletion", () => {
    it("adds a member (idempotently), blocks deletion, then frees and deletes", async () => {
      const created = await createTeam();
      const memberId = await createUser();

      const added = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/members/${memberId}`,
      );
      expect(added.status).toBe(200);
      expect(body<TeamBody>(added).members).toHaveLength(1);
      expect(body<TeamBody>(added).members[0]!.id).toBe(memberId);

      const addedAgain = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/members/${memberId}`,
      );
      expect(addedAgain.status).toBe(200);
      expect(body<TeamBody>(addedAgain).members).toHaveLength(1);

      const blocked = await asAdmin("delete", `/api/v1/teams/${created.id}`);
      expect(blocked.status).toBe(409);
      expect(body<ProblemBody>(blocked).code).toBe("TEAM_IN_USE");

      const removed = await asAdmin(
        "delete",
        `/api/v1/teams/${created.id}/members/${memberId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<TeamBody>(removed).members).toHaveLength(0);

      const deleted = await asAdmin("delete", `/api/v1/teams/${created.id}`);
      expect(deleted.status).toBe(204);
      expect(
        await prisma.team.findUnique({ where: { id: created.id } }),
      ).toBeNull();
    });

    it("409s removing a user that is not a member", async () => {
      const created = await createTeam();
      const response = await asAdmin(
        "delete",
        `/api/v1/teams/${created.id}/members/${plainUserId}`,
      );
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_IN_TEAM");
    });

    it("404s member routes for an unknown team or user", async () => {
      const created = await createTeam();
      const unknownTeam = await asAdmin(
        "put",
        `/api/v1/teams/${UUID}/members/${plainUserId}`,
      );
      expect(unknownTeam.status).toBe(404);
      expect(body<ProblemBody>(unknownTeam).code).toBe("TEAM_NOT_FOUND");

      const unknownUser = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/members/${UUID}`,
      );
      expect(unknownUser.status).toBe(404);
      expect(body<ProblemBody>(unknownUser).code).toBe("USER_NOT_FOUND");
    });

    it("404s a delete for an unknown team", async () => {
      const response = await asAdmin("delete", `/api/v1/teams/${UUID}`);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("TEAM_NOT_FOUND");
    });
  });

  describe("scoped visibility", () => {
    it("limits a Department Manager to teams in their own department", async () => {
      const own = await createTeam({
        name: "Manager Home Team",
        departmentId: homeDepartmentId,
      });
      const foreign = await createTeam({
        name: "Foreign Team",
        departmentId: otherDepartmentId,
      });
      await prisma.user.update({
        where: { id: deptManagerId },
        data: { departmentId: homeDepartmentId },
      });

      const list = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", deptManager.cookies);
      expect(list.status).toBe(200);
      const items = body<PageBody>(list).items;
      expect(items.length).toBeGreaterThan(0);
      expect(
        items.every((team) => team.department.id === homeDepartmentId),
      ).toBe(true);
      expect(items.some((team) => team.id === own.id)).toBe(true);

      const ownGet = await request(http)
        .get(`/api/v1/teams/${own.id}`)
        .set("Cookie", deptManager.cookies);
      expect(ownGet.status).toBe(200);

      const foreignGet = await request(http)
        .get(`/api/v1/teams/${foreign.id}`)
        .set("Cookie", deptManager.cookies);
      expect(foreignGet.status).toBe(403);
      expect(body<ProblemBody>(foreignGet).code).toBe("PERMISSION_DENIED");

      // An unknown id is also 403, not 404: a scoped reader cannot probe
      // whether a team exists outside their department.
      const unknownGet = await request(http)
        .get(`/api/v1/teams/${UUID}`)
        .set("Cookie", deptManager.cookies);
      expect(unknownGet.status).toBe(403);
      expect(body<ProblemBody>(unknownGet).code).toBe("PERMISSION_DENIED");
    });

    it("returns an empty page for a Department Manager with no department", async () => {
      await prisma.user.update({
        where: { id: deptManagerId },
        data: { departmentId: null },
      });
      const list = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", deptManager.cookies);
      expect(list.status).toBe(200);
      expect(body<PageBody>(list).items).toHaveLength(0);
    });

    it("forbids a Department Manager from creating a team", async () => {
      const response = await request(http)
        .post("/api/v1/teams")
        .set("Cookie", deptManager.cookies)
        .set("x-csrf-token", deptManager.csrfToken)
        .send({ name: "DM Team", departmentId: homeDepartmentId });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });
  });

  describe("request validation", () => {
    it.each([
      ["a name over 120 characters", { name: "x".repeat(121) }],
      ["a description over 1000 characters", { description: "y".repeat(1001) }],
      ["a manager id that is not a uuid", { managerId: "not-uuid" }],
      ["a department id that is not a uuid", { departmentId: "not-uuid" }],
      ["a whitespace-only name", { name: "   " }],
      ["a blank description", { description: " " }],
    ])("400s %s with VALIDATION_ERROR", async (_label, payload) => {
      const response = await asAdmin("post", "/api/v1/teams").send({
        name: "Valid Name",
        departmentId: homeDepartmentId,
        ...payload,
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("400s a missing departmentId on create", async () => {
      const response = await asAdmin("post", "/api/v1/teams").send({
        name: "No Dept Team",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("400s an unknown status filter and an over-large pageSize", async () => {
      expect((await asAdmin("get", "/api/v1/teams?status=BOGUS")).status).toBe(
        400,
      );
      expect((await asAdmin("get", "/api/v1/teams?pageSize=101")).status).toBe(
        400,
      );
    });

    it("requires an explicit managerId on the manager route", async () => {
      const created = await createTeam();
      const response = await asAdmin(
        "put",
        `/api/v1/teams/${created.id}/manager`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("transport and contract", () => {
    it("rejects manager and delete mutations missing the CSRF header", async () => {
      const created = await createTeam();
      expect(
        (
          await request(http)
            .put(`/api/v1/teams/${created.id}/manager`)
            .set("Cookie", superAdmin.cookies)
            .send({ managerId: null })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(http)
            .delete(`/api/v1/teams/${created.id}`)
            .set("Cookie", superAdmin.cookies)
        ).status,
      ).toBe(403);
    });

    it("treats an empty PATCH as a no-op that returns the current row", async () => {
      const created = await createTeam({ description: "Keep me." });
      const response = await asAdmin(
        "patch",
        `/api/v1/teams/${created.id}`,
      ).send({});
      expect(response.status).toBe(200);
      expect(body<TeamBody>(response).description).toBe("Keep me.");
    });

    it("returns only the public contract from get and list", async () => {
      const created = await createTeam();
      const one = await asAdmin("get", `/api/v1/teams/${created.id}`);
      expect(Object.keys(body<TeamBody>(one)).sort()).toEqual(TEAM_KEYS);
      const page = await asAdmin("get", "/api/v1/teams?pageSize=1");
      expect(Object.keys(body<PageBody>(page).items[0]!).sort()).toEqual(
        TEAM_KEYS,
      );
    });

    it("echoes the incoming x-request-id", async () => {
      const response = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", superAdmin.cookies)
        .set("x-request-id", "team-req-id-check");
      expect(response.headers["x-request-id"]).toBe("team-req-id-check");
    });
  });
});
