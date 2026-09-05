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
interface GrantBody {
  permissionKey: string;
  scope: string;
}
interface RoleBody {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}
interface RoleWithGrantsBody extends RoleBody {
  grants: GrantBody[];
}
interface PermissionBody {
  key: string;
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

describe("configurable roles and permissions API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  let superAdmin: Principal;
  let teamMember: Principal;
  let noRole: Principal;
  let scopeLimited: Principal;
  let talentManagerRoleId: string;
  let inUseRoleId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "rbac-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "rbac-refresh-token-secret-at-least-32-characters";
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

    async function assignRole(userId: string, roleId: string): Promise<void> {
      await prisma.userRoleAssignment.create({ data: { userId, roleId } });
    }

    async function loginAs(email: string): Promise<Principal> {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }

    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    const teamMemberRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Team Member" },
    });
    const talentManagerRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Talent Manager" },
    });
    talentManagerRoleId = talentManagerRole.id;

    const scopeLimitedRole = await prisma.role.create({
      data: { name: "Scope Limited Test Role" },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: scopeLimitedRole.id,
        permissionKey: "role.read",
        // Wrong scope on purpose: proves the precise service-level check
        // rejects a grant that does not exactly match, even though the
        // coarse transport guard passes on the key alone.
        scope: "SELF",
      },
    });

    const inUseRole = await prisma.role.create({
      data: { name: "In Use Test Role" },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: inUseRole.id,
        permissionKey: "role.read",
        scope: "ORGANIZATION",
      },
    });
    inUseRoleId = inUseRole.id;

    const superAdminUserId = await seedUser("super-admin@rbac.test");
    await assignRole(superAdminUserId, superAdminRole.id);
    superAdmin = await loginAs("super-admin@rbac.test");

    const teamMemberUserId = await seedUser("team-member@rbac.test");
    await assignRole(teamMemberUserId, teamMemberRole.id);
    teamMember = await loginAs("team-member@rbac.test");

    const noRoleUserId = await seedUser("no-role@rbac.test");
    void noRoleUserId;
    noRole = await loginAs("no-role@rbac.test");

    const scopeLimitedUserId = await seedUser("scope-limited@rbac.test");
    await assignRole(scopeLimitedUserId, scopeLimitedRole.id);
    scopeLimited = await loginAs("scope-limited@rbac.test");

    const inUseUserId = await seedUser("in-use@rbac.test");
    await assignRole(inUseUserId, inUseRole.id);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function createTestRole(): Promise<{ id: string; body: RoleBody }> {
    const response = await request(http)
      .post("/api/v1/roles")
      .set("Cookie", superAdmin.cookies)
      .set("x-csrf-token", superAdmin.csrfToken)
      .send({ name: `Test Role ${Math.random().toString(36).slice(2)}` });
    expect(response.status).toBe(201);
    const created = body<RoleBody>(response);
    return { id: created.id, body: created };
  }

  describe("authentication and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(http).get("/api/v1/roles");
      expect(response.status).toBe(401);
      expect(body<ProblemBody>(response).code).toBe("AUTH_UNAUTHENTICATED");
    });

    it("denies a user whose role holds no role.* permission at all", async () => {
      const response = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", teamMember.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("denies a user with no role assignment (baseline grants only)", async () => {
      const response = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", noRole.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("denies a user who holds the permission key only at the wrong scope", async () => {
      // Passes the coarse transport guard (holds "role.read" at some scope)
      // but fails the precise service-level check (needs it at ORGANIZATION).
      const response = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", scopeLimited.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("permits a user whose role holds the exact permission and scope", async () => {
      const response = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", superAdmin.cookies);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("rejects a mutation without the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/roles")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No CSRF Header" });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("CSRF_TOKEN_INVALID");
    });
  });

  describe("role lifecycle", () => {
    it("creates, reads, updates, and removes a role", async () => {
      const created = await createTestRole();
      expect(created.body.name.startsWith("Test Role ")).toBe(true);
      expect(created.body.description).toBeNull();
      expect(created.body.isSystem).toBe(false);

      const listed = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", superAdmin.cookies);
      expect(
        body<RoleBody[]>(listed).some((role) => role.id === created.id),
      ).toBe(true);

      const fetched = await request(http)
        .get(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies);
      expect(fetched.status).toBe(200);
      expect(body<RoleWithGrantsBody>(fetched).grants).toEqual([]);

      const updated = await request(http)
        .patch(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ description: "Updated description" });
      expect(updated.status).toBe(200);
      expect(body<RoleBody>(updated).description).toBe("Updated description");

      const removed = await request(http)
        .delete(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(removed.status).toBe(204);

      const afterDelete = await request(http)
        .get(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies);
      expect(afterDelete.status).toBe(404);
      expect(body<ProblemBody>(afterDelete).code).toBe("ROLE_NOT_FOUND");
    });

    it("rejects an empty name", async () => {
      const response = await request(http)
        .post("/api/v1/roles")
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ name: "" });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("rejects a duplicate role name on create and on update", async () => {
      const duplicateOnCreate = await request(http)
        .post("/api/v1/roles")
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ name: "Team Member" });
      expect(duplicateOnCreate.status).toBe(409);
      expect(body<ProblemBody>(duplicateOnCreate).code).toBe(
        "ROLE_NAME_CONFLICT",
      );

      const created = await createTestRole();
      const duplicateOnUpdate = await request(http)
        .patch(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ name: "Team Member" });
      expect(duplicateOnUpdate.status).toBe(409);
      expect(body<ProblemBody>(duplicateOnUpdate).code).toBe(
        "ROLE_NAME_CONFLICT",
      );
    });

    it("reports not found for an unknown role id on get, update, and delete", async () => {
      const get = await request(http)
        .get(`/api/v1/roles/${UUID}`)
        .set("Cookie", superAdmin.cookies);
      expect(get.status).toBe(404);
      expect(body<ProblemBody>(get).code).toBe("ROLE_NOT_FOUND");

      const patch = await request(http)
        .patch(`/api/v1/roles/${UUID}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ description: "x" });
      expect(patch.status).toBe(404);
      expect(body<ProblemBody>(patch).code).toBe("ROLE_NOT_FOUND");

      const del = await request(http)
        .delete(`/api/v1/roles/${UUID}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(del.status).toBe(404);
      expect(body<ProblemBody>(del).code).toBe("ROLE_NOT_FOUND");
    });

    it("refuses to remove a built-in system role", async () => {
      const response = await request(http)
        .delete(`/api/v1/roles/${talentManagerRoleId}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("ROLE_IS_SYSTEM");
    });

    it("refuses to remove a role assigned to a user", async () => {
      const response = await request(http)
        .delete(`/api/v1/roles/${inUseRoleId}`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("ROLE_IN_USE");
    });
  });

  describe("permission grants", () => {
    it("adds and removes a grant, and reports it in the role's grant list", async () => {
      const created = await createTestRole();

      const added = await request(http)
        .post(`/api/v1/roles/${created.id}/permissions`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ permissionKey: "task.review", scope: "ORGANIZATION" });
      expect(added.status).toBe(201);

      const fetched = await request(http)
        .get(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies);
      expect(body<RoleWithGrantsBody>(fetched).grants).toEqual([
        { permissionKey: "task.review", scope: "ORGANIZATION" },
      ]);

      const removed = await request(http)
        .delete(
          `/api/v1/roles/${created.id}/permissions/task.review/ORGANIZATION`,
        )
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(removed.status).toBe(204);

      const afterRemoval = await request(http)
        .get(`/api/v1/roles/${created.id}`)
        .set("Cookie", superAdmin.cookies);
      expect(body<RoleWithGrantsBody>(afterRemoval).grants).toEqual([]);
    });

    it("rejects an unknown permission key", async () => {
      const created = await createTestRole();
      const response = await request(http)
        .post(`/api/v1/roles/${created.id}/permissions`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ permissionKey: "not.a.real.key", scope: "ORGANIZATION" });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_NOT_FOUND");
    });

    it("rejects a duplicate grant", async () => {
      const created = await createTestRole();
      await request(http)
        .post(`/api/v1/roles/${created.id}/permissions`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ permissionKey: "task.review", scope: "ORGANIZATION" });

      const duplicate = await request(http)
        .post(`/api/v1/roles/${created.id}/permissions`)
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken)
        .send({ permissionKey: "task.review", scope: "ORGANIZATION" });
      expect(duplicate.status).toBe(409);
      expect(body<ProblemBody>(duplicate).code).toBe("GRANT_ALREADY_EXISTS");
    });

    it("reports not found removing a grant the role does not hold", async () => {
      const created = await createTestRole();
      const response = await request(http)
        .delete(
          `/api/v1/roles/${created.id}/permissions/task.review/ORGANIZATION`,
        )
        .set("Cookie", superAdmin.cookies)
        .set("x-csrf-token", superAdmin.csrfToken);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("GRANT_NOT_FOUND");
    });
  });

  describe("permission catalog", () => {
    it("lists the fixed permission catalog", async () => {
      const response = await request(http)
        .get("/api/v1/permissions")
        .set("Cookie", superAdmin.cookies);
      expect(response.status).toBe(200);
      expect(
        body<PermissionBody[]>(response).some(
          (permission) => permission.key === "task.review",
        ),
      ).toBe(true);
    });
  });
});
