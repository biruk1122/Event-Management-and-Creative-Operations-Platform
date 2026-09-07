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

describe("user and profile administration persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  let adminCookies: string[];
  let adminCsrf: string;
  let superAdminRoleId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "usr-persistence-access-token-secret-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "usr-persistence-refresh-token-secret-32-chars";
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

    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    superAdminRoleId = superAdminRole.id;

    const admin = await prisma.user.create({
      data: {
        email: "persistence-admin@usr.test",
        credential: { create: { passwordHash: credentialHash } },
        roleAssignment: { create: { roleId: superAdminRole.id } },
      },
    });
    void admin;
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "persistence-admin@usr.test", password: PASSWORD });
    expect(login.status).toBe(200);
    adminCookies = setCookies(login);
    adminCsrf = cookieValue(adminCookies, "csrf_token");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  function uniqueEmail(): string {
    counter += 1;
    return `persistence-${counter}@usr.test`;
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
  async function createUser(roleId?: string): Promise<string> {
    const response = await post("/api/v1/users").send({
      email: uniqueEmail(),
      firstName: "P",
      lastName: "Erson",
      temporaryPassword: "temp-password-123",
      ...(roleId ? { roleId } : {}),
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("database constraints", () => {
    it("allows at most one credential per user", async () => {
      const id = await createUser();
      await expect(
        db.query(
          `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
          [id, "argon2id$second"],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("cascades the credential and role assignment when the user is deleted", async () => {
      const id = await createUser(superAdminRoleId);

      await db.query(`DELETE FROM users WHERE id = $1`, [id]);

      const [credentials] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_credentials WHERE user_id = $1`,
        [id],
      );
      const [assignments] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_role_assignments WHERE user_id = $1`,
        [id],
      );
      expect(credentials!.count).toBe("0");
      expect(assignments!.count).toBe("0");
    });

    it("refuses to remove a role assigned to a user, at the database level", async () => {
      const role = await prisma.role.create({
        data: { name: `Persistence In-Use Role ${(counter += 1)}` },
      });
      await put(`/api/v1/users/${await createUser()}/role`)
        .send({ roleId: role.id })
        .expect(200);

      await expect(
        db.query(`DELETE FROM roles WHERE id = $1`, [role.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("keeps deactivated_at in step with status through the API", async () => {
      const id = await createUser();

      await post(`/api/v1/users/${id}/deactivate`).expect(200);
      const [afterOff] = await db.query<{
        status: string;
        deactivated_at: string | null;
      }>(`SELECT status, deactivated_at FROM users WHERE id = $1`, [id]);
      expect(afterOff!.status).toBe("INACTIVE");
      expect(afterOff!.deactivated_at).not.toBeNull();

      await post(`/api/v1/users/${id}/reactivate`).expect(200);
      const [afterOn] = await db.query<{
        status: string;
        deactivated_at: string | null;
      }>(`SELECT status, deactivated_at FROM users WHERE id = $1`, [id]);
      expect(afterOn).toEqual({ status: "ACTIVE", deactivated_at: null });
    });
  });

  describe("create is one all-or-nothing transaction", () => {
    it("persists no user or credential when the nested role assignment fails", async () => {
      const email = uniqueEmail();

      await expect(
        prisma.user.create({
          data: {
            email,
            credential: { create: { passwordHash: "argon2id$hash" } },
            roleAssignment: { create: { roleId: MISSING_UUID } },
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });

      const [users] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users WHERE email = $1`,
        [email],
      );
      const [credentials] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_credentials c
           JOIN users u ON u.id = c.user_id WHERE u.email = $1`,
        [email],
      );
      expect(users!.count).toBe("0");
      expect(credentials!.count).toBe("0");
    });

    it("the API surfaces the same failure as ROLE_NOT_FOUND and writes nothing", async () => {
      const email = uniqueEmail();
      const response = await post("/api/v1/users").send({
        email,
        firstName: "No",
        lastName: "Role",
        temporaryPassword: "temp-password-123",
        roleId: MISSING_UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("ROLE_NOT_FOUND");
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });
  });

  describe("status transitions and the live session", () => {
    it("deactivation locks the session, and reactivation restores the same session", async () => {
      const email = uniqueEmail();
      const created = await post("/api/v1/users").send({
        email,
        firstName: "Round",
        lastName: "Trip",
        temporaryPassword: "temp-password-123",
        roleId: superAdminRoleId,
      });
      expect(created.status).toBe(201);
      const id = body<{ id: string }>(created).id;

      const login = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: "temp-password-123" });
      const cookies = setCookies(login);

      expect(
        (await request(http).get("/api/v1/users").set("Cookie", cookies))
          .status,
      ).toBe(200);

      await post(`/api/v1/users/${id}/deactivate`).expect(200);
      expect(
        (await request(http).get("/api/v1/users").set("Cookie", cookies))
          .status,
      ).toBe(401);

      // Reactivation only flips status; the refresh session was never revoked,
      // so the original cookies authenticate again with no re-login.
      await post(`/api/v1/users/${id}/reactivate`).expect(200);
      expect(
        (await request(http).get("/api/v1/users").set("Cookie", cookies))
          .status,
      ).toBe(200);
    });

    it("a role granted through the API takes effect on the target's next request", async () => {
      const email = uniqueEmail();
      const created = await post("/api/v1/users").send({
        email,
        firstName: "Gains",
        lastName: "Access",
        temporaryPassword: "temp-password-123",
      });
      const id = body<{ id: string }>(created).id;
      const cookies = setCookies(
        await request(http)
          .post("/api/v1/auth/login")
          .send({ email, password: "temp-password-123" }),
      );

      expect(
        (await request(http).get("/api/v1/users").set("Cookie", cookies))
          .status,
      ).toBe(403);

      await put(`/api/v1/users/${id}/role`)
        .send({ roleId: superAdminRoleId })
        .expect(200);

      expect(
        (await request(http).get("/api/v1/users").set("Cookie", cookies))
          .status,
      ).toBe(200);
    });
  });
});
