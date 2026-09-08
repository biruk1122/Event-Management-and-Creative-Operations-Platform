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

interface TeamBody {
  id: string;
  name: string;
  department: { id: string; name: string };
  manager: { id: string } | null;
  members: { id: string }[];
  deactivatedAt: string | null;
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

describe("team management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  let adminCookies: string[];
  let adminCsrf: string;
  let managerCookies: string[];
  let managerUserId: string;

  let departmentId: string;
  let otherDepartmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "team-persistence-access-token-secret-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "team-persistence-refresh-token-secret-32-chars";
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

    await seedUser("persistence-admin@team.test", "Super Admin");
    adminCookies = await loginAs("persistence-admin@team.test");
    adminCsrf = cookieValue(adminCookies, "csrf_token");

    managerUserId = await seedUser(
      "persistence-manager@team.test",
      "Department Manager",
    );
    managerCookies = await loginAs("persistence-manager@team.test");

    const department = await prisma.department.create({
      data: { name: "Persistence Home Department" },
    });
    const otherDepartment = await prisma.department.create({
      data: { name: "Persistence Other Department" },
    });
    departmentId = department.id;
    otherDepartmentId = otherDepartment.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  function uniqueName(): string {
    counter += 1;
    return `Persistence Team ${counter}`;
  }
  function uniqueEmail(): string {
    counter += 1;
    return `persistence-${counter}@team.test`;
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

  async function createTeam(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await post("/api/v1/teams").send({
      name: uniqueName(),
      departmentId,
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
      const teamId = await createTeam({ managerId });

      await db.query(`DELETE FROM users WHERE id = $1`, [managerId]);

      const [row] = await db.query<{ manager_id: string | null }>(
        `SELECT manager_id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(row?.manager_id).toBeNull();
      const fetched = await get(`/api/v1/teams/${teamId}`).expect(200);
      expect(body<TeamBody>(fetched).manager).toBeNull();
    });

    it("reports members from the live team_memberships join", async () => {
      const teamId = await createTeam();
      const first = await createUser();
      const second = await createUser();

      await db.query(
        `INSERT INTO team_memberships (team_id, user_id)
         SELECT $1, unnest($2::uuid[])`,
        [teamId, [first, second]],
      );
      expect(
        body<TeamBody>(await get(`/api/v1/teams/${teamId}`).expect(200))
          .members.map((member) => member.id)
          .sort(),
      ).toEqual([first, second].sort());

      await db.query(
        `DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2`,
        [teamId, first],
      );
      expect(
        body<TeamBody>(await get(`/api/v1/teams/${teamId}`).expect(200))
          .members,
      ).toHaveLength(1);
    });

    it("scopes name uniqueness to the department at the database and API", async () => {
      const name = uniqueName();
      await post("/api/v1/teams").send({ name, departmentId }).expect(201);

      await expect(
        db.query(`INSERT INTO teams (name, department_id) VALUES ($1, $2)`, [
          name,
          departmentId,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

      const dup = await post("/api/v1/teams").send({ name, departmentId });
      expect(dup.status).toBe(409);
      expect(body<ProblemBody>(dup).code).toBe("TEAM_NAME_CONFLICT");

      const elsewhere = await post("/api/v1/teams").send({
        name,
        departmentId: otherDepartmentId,
      });
      expect(elsewhere.status).toBe(201);
    });

    it("rejects a whitespace-only name or description at the database", async () => {
      await expect(
        db.query(`INSERT INTO teams (name, department_id) VALUES ($1, $2)`, [
          "   ",
          departmentId,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        db.query(
          `INSERT INTO teams (name, department_id, description) VALUES ($1, $2, $3)`,
          [uniqueName(), departmentId, "  "],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("keeps deactivated_at coherent across deactivate and reactivate", async () => {
      const teamId = await createTeam();

      await post(`/api/v1/teams/${teamId}/deactivate`).expect(200);
      const [off] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(off?.deactivated_at).not.toBeNull();

      await post(`/api/v1/teams/${teamId}/reactivate`).expect(200);
      const [on] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(on?.deactivated_at).toBeNull();
    });
  });

  describe("deletion is all-or-nothing", () => {
    it("refuses to delete a team with a member, leaving both intact", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();
      await put(`/api/v1/teams/${teamId}/members/${memberId}`).expect(200);

      const blocked = await del(`/api/v1/teams/${teamId}`);
      expect(blocked.status).toBe(409);
      expect(body<ProblemBody>(blocked).code).toBe("TEAM_IN_USE");

      const [team] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(team?.id).toBe(teamId);
      const [membership] = await db.query<{ user_id: string }>(
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(membership?.user_id).toBe(memberId);
    });

    it("deletes an empty team without touching another one", async () => {
      const empty = await createTeam();
      const populated = await createTeam();
      const memberId = await createUser();
      await put(`/api/v1/teams/${populated}/members/${memberId}`).expect(200);

      await del(`/api/v1/teams/${empty}`).expect(204);

      expect(await prisma.team.findUnique({ where: { id: empty } })).toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: populated } }),
      ).not.toBeNull();
      const [membership] = await db.query<{ user_id: string }>(
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [populated],
      );
      expect(membership?.user_id).toBe(memberId);
    });

    it("leaves no dangling membership when add and delete race", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();

      const [add, remove] = await Promise.all([
        put(`/api/v1/teams/${teamId}/members/${memberId}`),
        del(`/api/v1/teams/${teamId}`),
      ]);

      // Neither request may 500, whatever the interleaving.
      for (const status of [add.status, remove.status]) {
        expect(status).toBeLessThan(500);
      }
      expect([200, 404]).toContain(add.status);
      expect([204, 409]).toContain(remove.status);

      // Whatever happened, the row state is self-consistent: the team and its
      // one membership stand or fall together, and the user is untouched.
      const [team] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      const memberships = await db.query<{ user_id: string }>(
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      if (team) {
        // The team survived, so the delete was refused (409) and the add won.
        expect(remove.status).toBe(409);
        expect(memberships.map((row) => row.user_id)).toEqual([memberId]);
      } else {
        // The team is gone, so the delete succeeded and any membership row
        // cascaded away with it.
        expect(remove.status).toBe(204);
        expect(memberships).toHaveLength(0);
      }
      const [user] = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1`,
        [memberId],
      );
      expect(user?.id).toBe(memberId);
    });
  });

  describe("department ownership is enforced both ways", () => {
    it("refuses a raw delete of a department that still owns a team", async () => {
      const teamId = await createTeam();

      await expect(
        db.query(`DELETE FROM departments WHERE id = $1`, [departmentId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });

      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(survivor?.id).toBe(teamId);
    });

    it("returns DEPARTMENT_IN_USE, not a 500, when deleting a department that owns a team", async () => {
      const owning = await prisma.department.create({
        data: { name: `Owning Dept for ${uniqueName()}` },
      });
      const teamId = await createTeam({ departmentId: owning.id });

      const blocked = await del(`/api/v1/departments/${owning.id}`);
      expect(blocked.status).toBe(409);
      expect(body<ProblemBody>(blocked).code).toBe("DEPARTMENT_IN_USE");

      expect(
        await prisma.department.findUnique({ where: { id: owning.id } }),
      ).not.toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();

      // Once the team is gone the department can be removed.
      await del(`/api/v1/teams/${teamId}`).expect(204);
      await del(`/api/v1/departments/${owning.id}`).expect(204);
    });
  });

  describe("membership cascades with either end", () => {
    it("drops membership rows when the team row is deleted directly", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();
      await put(`/api/v1/teams/${teamId}/members/${memberId}`).expect(200);

      await db.query(`DELETE FROM teams WHERE id = $1`, [teamId]);

      const memberships = await db.query(
        `SELECT user_id FROM team_memberships WHERE user_id = $1`,
        [memberId],
      );
      expect(memberships).toHaveLength(0);
      const [user] = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1`,
        [memberId],
      );
      expect(user?.id).toBe(memberId);
    });

    it("drops membership rows when the user row is deleted directly", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();
      await put(`/api/v1/teams/${teamId}/members/${memberId}`).expect(200);

      await db.query(`DELETE FROM users WHERE id = $1`, [memberId]);

      const memberships = await db.query(
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(memberships).toHaveLength(0);
      const [team] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(team?.id).toBe(teamId);
    });

    it("keeps membership de-duplicated across a repeated add", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();

      await put(`/api/v1/teams/${teamId}/members/${memberId}`).expect(200);
      await put(`/api/v1/teams/${teamId}/members/${memberId}`).expect(200);

      const memberships = await db.query(
        `SELECT user_id FROM team_memberships WHERE team_id = $1`,
        [teamId],
      );
      expect(memberships).toHaveLength(1);
    });
  });

  describe("state transitions and live scope", () => {
    it("tolerates two simultaneous deactivations and converges to inactive", async () => {
      const teamId = await createTeam();

      const [first, second] = await Promise.all([
        post(`/api/v1/teams/${teamId}/deactivate`),
        post(`/api/v1/teams/${teamId}/deactivate`),
      ]);

      const statuses = [first.status, second.status];
      expect(
        statuses.filter((code) => code === 200).length,
      ).toBeGreaterThanOrEqual(1);
      expect(statuses.every((code) => code === 200 || code === 409)).toBe(true);

      const [row] = await db.query<{ deactivated_at: string | null }>(
        `SELECT deactivated_at FROM teams WHERE id = $1`,
        [teamId],
      );
      expect(row?.deactivated_at).not.toBeNull();
    });

    it("follows a Department Manager's department_id on their next request", async () => {
      const ownTeam = await createTeam({ departmentId });
      const foreignTeam = await createTeam({ departmentId: otherDepartmentId });

      const before = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", managerCookies)
        .expect(200);
      expect(body<{ items: unknown[] }>(before).items).toHaveLength(0);

      await db.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [
        departmentId,
        managerUserId,
      ]);
      const during = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", managerCookies)
        .expect(200);
      const items = body<{
        items: { id: string; department: { id: string } }[];
      }>(during).items;
      expect(items.some((team) => team.id === ownTeam)).toBe(true);
      expect(items.some((team) => team.id === foreignTeam)).toBe(false);
      expect(items.every((team) => team.department.id === departmentId)).toBe(
        true,
      );

      const foreignGet = await request(http)
        .get(`/api/v1/teams/${foreignTeam}`)
        .set("Cookie", managerCookies);
      expect(foreignGet.status).toBe(403);

      await db.query(`UPDATE users SET department_id = NULL WHERE id = $1`, [
        managerUserId,
      ]);
      const after = await request(http)
        .get("/api/v1/teams")
        .set("Cookie", managerCookies)
        .expect(200);
      expect(body<{ items: unknown[] }>(after).items).toHaveLength(0);
    });

    it("maps a member add for a just-deleted team as TEAM_NOT_FOUND", async () => {
      const teamId = await createTeam();
      const memberId = await createUser();
      await del(`/api/v1/teams/${teamId}`).expect(204);

      const response = await put(`/api/v1/teams/${teamId}/members/${memberId}`);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("TEAM_NOT_FOUND");
      const memberships = await db.query(
        `SELECT user_id FROM team_memberships WHERE user_id = $1`,
        [memberId],
      );
      expect(memberships).toHaveLength(0);
    });

    it("writes nothing when the create manager FK is bad", async () => {
      const name = uniqueName();

      const response = await post("/api/v1/teams").send({
        name,
        departmentId,
        managerId: MISSING_UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.team.findFirst({ where: { name } })).toBeNull();
    });

    it("writes nothing when the create department FK is bad", async () => {
      const name = uniqueName();

      const response = await post("/api/v1/teams").send({
        name,
        departmentId: MISSING_UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe(
        "TEAM_DEPARTMENT_NOT_FOUND",
      );
      expect(await prisma.team.findFirst({ where: { name } })).toBeNull();
    });
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(7);
  });
});
