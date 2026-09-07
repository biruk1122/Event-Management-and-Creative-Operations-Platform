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

interface UserBody {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileImage: string | null;
  status: "ACTIVE" | "INACTIVE";
  deactivatedAt: string | null;
  role: { id: string; name: string } | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: UserBody[];
  page: number;
  pageSize: number;
  total: number;
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

describe("user and profile administration API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let plainUser: Principal;
  let plainUserId: string;
  let superAdminRoleId: string;
  let teamMemberRoleId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "usr-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "usr-refresh-token-secret-at-least-32-characters";
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
    const credentialHash = await new hasherModule.PasswordHasher().hash(
      PASSWORD,
    );

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
    superAdminRoleId = superAdminRole.id;
    teamMemberRoleId = (
      await prisma.role.findUniqueOrThrow({ where: { name: "Team Member" } })
    ).id;

    const superAdminUserId = await seedUser("super-admin@usr.test");
    await prisma.userRoleAssignment.create({
      data: { userId: superAdminUserId, roleId: superAdminRole.id },
    });
    superAdmin = await loginAs("super-admin@usr.test");

    plainUserId = await seedUser("plain@usr.test");
    plainUser = await loginAs("plain@usr.test");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function asAdmin(method: "get" | "post" | "patch" | "put", path: string) {
    const req = request(http)[method](path).set("Cookie", superAdmin.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", superAdmin.csrfToken);
  }

  async function createUser(
    overrides: Record<string, unknown> = {},
  ): Promise<UserBody> {
    const response = await asAdmin("post", "/api/v1/users").send({
      email: `u-${Math.random().toString(36).slice(2)}@usr.test`,
      firstName: "Test",
      lastName: "Person",
      temporaryPassword: "temp-password-123",
      ...overrides,
    });
    expect(response.status).toBe(201);
    return body<UserBody>(response);
  }

  describe("authentication and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(http).get("/api/v1/users");
      expect(response.status).toBe(401);
    });

    it("rejects a caller without user.read", async () => {
      const response = await request(http)
        .get("/api/v1/users")
        .set("Cookie", plainUser.cookies);
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
    });

    it("rejects a mutation without user.create", async () => {
      const response = await request(http)
        .post("/api/v1/users")
        .set("Cookie", plainUser.cookies)
        .set("x-csrf-token", plainUser.csrfToken)
        .send({
          email: "should-not@usr.test",
          firstName: "No",
          lastName: "Access",
          temporaryPassword: "temp-password-123",
        });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      const leaked = await prisma.user.findUnique({
        where: { email: "should-not@usr.test" },
      });
      expect(leaked).toBeNull();
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/users")
        .set("Cookie", superAdmin.cookies)
        .send({
          email: "no-csrf@usr.test",
          firstName: "No",
          lastName: "Csrf",
          temporaryPassword: "temp-password-123",
        });
      expect(response.status).toBe(403);
    });
  });

  describe("create", () => {
    it("creates a user with an operator-set password and no contract leak", async () => {
      const response = await asAdmin("post", "/api/v1/users").send({
        email: "Newcomer@USR.test",
        firstName: "New",
        lastName: "Comer",
        phone: "+1 (555) 123-4567",
        temporaryPassword: "temp-password-123",
        roleId: teamMemberRoleId,
      });
      expect(response.status).toBe(201);
      const created = body<UserBody>(response);

      expect(created.email).toBe("newcomer@usr.test");
      expect(created.status).toBe("ACTIVE");
      expect(created.deactivatedAt).toBeNull();
      expect(created.mustChangePassword).toBe(true);
      expect(created.role).toEqual({
        id: teamMemberRoleId,
        name: "Team Member",
      });
      expect(Object.keys(created).sort()).toEqual(
        [
          "createdAt",
          "deactivatedAt",
          "email",
          "firstName",
          "id",
          "lastName",
          "mustChangePassword",
          "phone",
          "profileImage",
          "role",
          "status",
          "updatedAt",
        ].sort(),
      );
    });

    it("409s a duplicate email regardless of case", async () => {
      await createUser({ email: "dupe@usr.test" });
      const response = await asAdmin("post", "/api/v1/users").send({
        email: "DUPE@usr.test",
        firstName: "Second",
        lastName: "Dupe",
        temporaryPassword: "temp-password-123",
      });
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("USER_EMAIL_CONFLICT");
    });

    it("404s an unknown roleId and writes nothing", async () => {
      const response = await asAdmin("post", "/api/v1/users").send({
        email: "bad-role@usr.test",
        firstName: "Bad",
        lastName: "Role",
        temporaryPassword: "temp-password-123",
        roleId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("ROLE_NOT_FOUND");
      expect(
        await prisma.user.findUnique({ where: { email: "bad-role@usr.test" } }),
      ).toBeNull();
    });

    it("rejects a too-short temporary password with VALIDATION_ERROR", async () => {
      const response = await asAdmin("post", "/api/v1/users").send({
        email: "weak@usr.test",
        firstName: "Weak",
        lastName: "Pass",
        temporaryPassword: "short",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("read and list", () => {
    it("404s an unknown id", async () => {
      const response = await asAdmin("get", `/api/v1/users/${UUID}`);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
    });

    it("returns a paginated envelope and honours the status filter", async () => {
      const created = await createUser();
      await asAdmin("post", `/api/v1/users/${created.id}/deactivate`);

      const page = body<PageBody>(
        await asAdmin("get", "/api/v1/users?status=INACTIVE&pageSize=100"),
      );
      expect(page.page).toBe(1);
      expect(page.items.every((user) => user.status === "INACTIVE")).toBe(true);
      expect(page.items.some((user) => user.id === created.id)).toBe(true);
      expect(page.total).toBe(page.items.length);
    });

    it("honours the text search filter", async () => {
      await createUser({
        email: "searchable-target@usr.test",
        firstName: "Zzunique",
        lastName: "Name",
      });
      const page = body<PageBody>(
        await asAdmin("get", "/api/v1/users?search=zzunique"),
      );
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.firstName).toBe("Zzunique");
    });
  });

  describe("update", () => {
    it("patches only the provided fields", async () => {
      const created = await createUser({ firstName: "Before", lastName: "X" });
      const response = await asAdmin(
        "patch",
        `/api/v1/users/${created.id}`,
      ).send({ firstName: "After" });
      expect(response.status).toBe(200);
      const updated = body<UserBody>(response);
      expect(updated.firstName).toBe("After");
      expect(updated.lastName).toBe("X");
    });

    it("409s an email that another user already holds", async () => {
      const first = await createUser({ email: "keep@usr.test" });
      const second = await createUser();
      const response = await asAdmin(
        "patch",
        `/api/v1/users/${second.id}`,
      ).send({ email: "KEEP@usr.test" });
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe("USER_EMAIL_CONFLICT");
      void first;
    });

    it("404s an unknown id", async () => {
      const response = await asAdmin("patch", `/api/v1/users/${UUID}`).send({
        firstName: "Nobody",
      });
      expect(response.status).toBe(404);
    });
  });

  describe("deactivate and reactivate", () => {
    it("deactivates, then rejects a second deactivation, then reactivates", async () => {
      const created = await createUser();

      const off = await asAdmin(
        "post",
        `/api/v1/users/${created.id}/deactivate`,
      );
      expect(off.status).toBe(200);
      expect(body<UserBody>(off).status).toBe("INACTIVE");
      expect(body<UserBody>(off).deactivatedAt).not.toBeNull();

      const again = await asAdmin(
        "post",
        `/api/v1/users/${created.id}/deactivate`,
      );
      expect(again.status).toBe(409);
      expect(body<ProblemBody>(again).code).toBe("USER_ALREADY_INACTIVE");

      const on = await asAdmin(
        "post",
        `/api/v1/users/${created.id}/reactivate`,
      );
      expect(on.status).toBe(200);
      expect(body<UserBody>(on).status).toBe("ACTIVE");
      expect(body<UserBody>(on).deactivatedAt).toBeNull();

      const reAgain = await asAdmin(
        "post",
        `/api/v1/users/${created.id}/reactivate`,
      );
      expect(reAgain.status).toBe(409);
      expect(body<ProblemBody>(reAgain).code).toBe("USER_ALREADY_ACTIVE");
    });

    it("locks out a deactivated account on its next request", async () => {
      const email = `lockme-${Math.random().toString(36).slice(2)}@usr.test`;
      const created = await asAdmin("post", "/api/v1/users").send({
        email,
        firstName: "Lock",
        lastName: "Me",
        temporaryPassword: "temp-password-123",
        roleId: superAdminRoleId,
      });
      expect(created.status).toBe(201);

      const victim = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: "temp-password-123" });
      const victimCookies = setCookies(victim);
      expect(
        (await request(http).get("/api/v1/users").set("Cookie", victimCookies))
          .status,
      ).toBe(200);

      await asAdmin(
        "post",
        `/api/v1/users/${body<UserBody>(created).id}/deactivate`,
      );

      expect(
        (await request(http).get("/api/v1/users").set("Cookie", victimCookies))
          .status,
      ).toBe(401);
    });
  });

  describe("role assignment", () => {
    it("assigns, changes, and clears a role, and the change takes effect", async () => {
      // Plain user has no user.* access.
      expect(
        (
          await request(http)
            .get("/api/v1/users")
            .set("Cookie", plainUser.cookies)
        ).status,
      ).toBe(403);

      const assign = await asAdmin(
        "put",
        `/api/v1/users/${plainUserId}/role`,
      ).send({ roleId: superAdminRoleId });
      expect(assign.status).toBe(200);
      expect(body<UserBody>(assign).role).toEqual({
        id: superAdminRoleId,
        name: "Super Admin",
      });

      // The grant is resolved live - no re-login needed.
      expect(
        (
          await request(http)
            .get("/api/v1/users")
            .set("Cookie", plainUser.cookies)
        ).status,
      ).toBe(200);

      const clear = await asAdmin(
        "put",
        `/api/v1/users/${plainUserId}/role`,
      ).send({ roleId: null });
      expect(clear.status).toBe(200);
      expect(body<UserBody>(clear).role).toBeNull();

      expect(
        (
          await request(http)
            .get("/api/v1/users")
            .set("Cookie", plainUser.cookies)
        ).status,
      ).toBe(403);
    });

    it("404s an unknown user and an unknown role", async () => {
      const noUser = await asAdmin("put", `/api/v1/users/${UUID}/role`).send({
        roleId: superAdminRoleId,
      });
      expect(noUser.status).toBe(404);
      expect(body<ProblemBody>(noUser).code).toBe("USER_NOT_FOUND");

      const created = await createUser();
      const noRole = await asAdmin(
        "put",
        `/api/v1/users/${created.id}/role`,
      ).send({ roleId: UUID });
      expect(noRole.status).toBe(404);
      expect(body<ProblemBody>(noRole).code).toBe("ROLE_NOT_FOUND");
    });

    it("rejects a role body that is neither a uuid nor null", async () => {
      const created = await createUser();
      const response = await asAdmin(
        "put",
        `/api/v1/users/${created.id}/role`,
      ).send({ roleId: "not-a-uuid" });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("clears a role idempotently when the user has none", async () => {
      const created = await createUser();
      const response = await asAdmin(
        "put",
        `/api/v1/users/${created.id}/role`,
      ).send({ roleId: null });
      expect(response.status).toBe(200);
      expect(body<UserBody>(response).role).toBeNull();
    });

    it("requires the roleId key to be present", async () => {
      const created = await createUser();
      const response = await asAdmin(
        "put",
        `/api/v1/users/${created.id}/role`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("request validation", () => {
    it("rejects an unwhitelisted body field", async () => {
      const response = await asAdmin("post", "/api/v1/users").send({
        email: "extra-field@usr.test",
        firstName: "Extra",
        lastName: "Field",
        temporaryPassword: "temp-password-123",
        isSystemAdmin: true,
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it.each([["status=BOGUS"], ["page=0"], ["pageSize=0"], ["pageSize=101"]])(
      "rejects the query %s",
      async (query) => {
        const response = await asAdmin("get", `/api/v1/users?${query}`);
        expect(response.status).toBe(400);
        expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
      },
    );

    it("treats an empty PATCH as a no-op and returns the unchanged user", async () => {
      const created = await createUser({
        firstName: "Same",
        lastName: "Name",
      });
      const response = await asAdmin(
        "patch",
        `/api/v1/users/${created.id}`,
      ).send({});
      expect(response.status).toBe(200);
      expect(body<UserBody>(response)).toMatchObject({
        id: created.id,
        firstName: "Same",
        lastName: "Name",
      });
    });

    it("allows a user to keep its own email on PATCH without a false conflict", async () => {
      const created = await createUser({ email: "self-keep@usr.test" });
      const response = await asAdmin(
        "patch",
        `/api/v1/users/${created.id}`,
      ).send({ email: "SELF-KEEP@usr.test", firstName: "Kept" });
      expect(response.status).toBe(200);
      expect(body<UserBody>(response)).toMatchObject({
        email: "self-keep@usr.test",
        firstName: "Kept",
      });
    });
  });

  describe("concurrent requests", () => {
    it("lets exactly one of two simultaneous creates with the same email win", async () => {
      const email = `race-create-${Math.random().toString(36).slice(2)}@usr.test`;
      const payload = {
        email,
        firstName: "Race",
        lastName: "Create",
        temporaryPassword: "temp-password-123",
      };

      const [first, second] = await Promise.all([
        asAdmin("post", "/api/v1/users").send(payload),
        asAdmin("post", "/api/v1/users").send(payload),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it("never corrupts the row under two simultaneous deactivations", async () => {
      const created = await createUser();

      const [first, second] = await Promise.all([
        asAdmin("post", `/api/v1/users/${created.id}/deactivate`),
        asAdmin("post", `/api/v1/users/${created.id}/deactivate`),
      ]);

      // The two requests can interleave before either write commits, so both
      // may succeed; the guarantee is that at least one does, neither raises
      // an unexpected error, and the row stays coherent.
      const statuses = [first.status, second.status];
      expect(
        statuses.filter((code) => code === 200).length,
      ).toBeGreaterThanOrEqual(1);
      expect(statuses.every((code) => code === 200 || code === 409)).toBe(true);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.status).toBe("INACTIVE");
      expect(row.deactivatedAt).not.toBeNull();
    });

    it("keeps a single role assignment under two simultaneous role writes", async () => {
      const created = await createUser();
      const roleA = await prisma.role.findUniqueOrThrow({
        where: { name: "Team Member" },
      });
      const roleB = await prisma.role.findUniqueOrThrow({
        where: { name: "Talent Manager" },
      });

      const [first, second] = await Promise.all([
        asAdmin("put", `/api/v1/users/${created.id}/role`).send({
          roleId: roleA.id,
        }),
        asAdmin("put", `/api/v1/users/${created.id}/role`).send({
          roleId: roleB.id,
        }),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const assignments = await prisma.userRoleAssignment.findMany({
        where: { userId: created.id },
      });
      expect(assignments).toHaveLength(1);
      expect([roleA.id, roleB.id]).toContain(assignments[0]!.roleId);
    });
  });
});
