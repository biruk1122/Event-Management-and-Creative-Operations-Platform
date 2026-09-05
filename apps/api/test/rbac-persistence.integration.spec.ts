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

describe("configurable roles and permissions persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "rbac-persistence-access-token-secret-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "rbac-persistence-refresh-token-secret-32-chars";
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
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  let userCounter = 0;
  async function seedUser(): Promise<{ id: string; email: string }> {
    userCounter += 1;
    const email = `persistence-${userCounter}@rbac.test`;
    const user = await prisma.user.create({
      data: { email, credential: { create: { passwordHash: credentialHash } } },
    });
    return { id: user.id, email };
  }

  let roleCounter = 0;
  async function seedRole(grants: { permissionKey: string; scope: string }[]) {
    roleCounter += 1;
    const role = await prisma.role.create({
      data: { name: `Persistence Test Role ${roleCounter}` },
    });
    for (const grant of grants) {
      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionKey: grant.permissionKey,
          scope: grant.scope as never,
        },
      });
    }
    return role;
  }

  async function loginAs(email: string): Promise<string[]> {
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    return setCookies(response);
  }

  describe("database constraints", () => {
    it("allows at most one role assignment per user", async () => {
      const user = await seedUser();
      const roleA = await seedRole([]);
      const roleB = await seedRole([]);

      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: roleA.id },
      });

      await expect(
        prisma.userRoleAssignment.create({
          data: { userId: user.id, roleId: roleB.id },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("cascades role assignment deletion when the user is removed", async () => {
      const user = await seedUser();
      const role = await seedRole([]);
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });

      await db.query(`DELETE FROM users WHERE id = $1`, [user.id]);

      const [remaining] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_role_assignments WHERE user_id = $1`,
        [user.id],
      );
      expect(remaining!.count).toBe("0");
    });

    it("refuses to remove a role that is assigned to a user, at the database level", async () => {
      const user = await seedUser();
      const role = await seedRole([]);
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });

      await expect(
        db.query(`DELETE FROM roles WHERE id = $1`, [role.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });
  });

  describe("state transitions take effect without re-authenticating", () => {
    it("drops a user to baseline access the moment their role assignment is removed", async () => {
      const user = await seedUser();
      const role = await seedRole([
        { permissionKey: "role.read", scope: "ORGANIZATION" },
      ]);
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
      const cookies = await loginAs(user.email);

      const before = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      expect(before.status).toBe(200);

      await prisma.userRoleAssignment.delete({ where: { userId: user.id } });

      const after = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      expect(after.status).toBe(403);
      expect(body<ProblemBody>(after).code).toBe("PERMISSION_DENIED");
    });

    it("applies a role change on the very next request", async () => {
      const user = await seedUser();
      const grantedRole = await seedRole([
        { permissionKey: "role.read", scope: "ORGANIZATION" },
      ]);
      const bareRole = await seedRole([]);
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: grantedRole.id },
      });
      const cookies = await loginAs(user.email);

      const before = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      expect(before.status).toBe(200);

      await prisma.userRoleAssignment.update({
        where: { userId: user.id },
        data: { roleId: bareRole.id },
      });

      const after = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      expect(after.status).toBe(403);
      expect(body<ProblemBody>(after).code).toBe("PERMISSION_DENIED");
    });

    it("locks out a deactivated user entirely, even with an untouched role assignment", async () => {
      const user = await seedUser();
      const role = await seedRole([
        { permissionKey: "role.read", scope: "ORGANIZATION" },
      ]);
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
      const cookies = await loginAs(user.email);

      const before = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      expect(before.status).toBe(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { status: "INACTIVE" },
      });

      const after = await request(http)
        .get("/api/v1/roles")
        .set("Cookie", cookies);
      // Deactivation is an authentication failure (IAM-03), not merely a
      // missing permission - the RBAC grant is untouched, but the account
      // itself can no longer authenticate at all.
      expect(after.status).toBe(401);
      expect(body<ProblemBody>(after).code).toBe("AUTH_UNAUTHENTICATED");
    });
  });
});
