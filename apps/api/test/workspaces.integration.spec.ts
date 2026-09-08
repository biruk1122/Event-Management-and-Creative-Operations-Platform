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

interface WorkspaceBody {
  id: string;
  kind: string;
  manager: { id: string; email: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string; email: string }[];
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: WorkspaceBody[];
  page: number;
  pageSize: number;
  total: number;
}

const WORKSPACE_KEYS = [
  "createdAt",
  "id",
  "kind",
  "manager",
  "participants",
  "teams",
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

describe("connected workspace ownership API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let management: Principal;
  let plainUser: Principal;
  let plainUserId: string;
  let credentialHash: string;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "workspace-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "workspace-refresh-token-secret-at-least-32-chars";
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

    const superAdminId = await seedUser("super-admin@workspace.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@workspace.test");

    const managementId = await seedUser("management@workspace.test");
    await assignRole(managementId, "Management/Administrator");
    management = await loginAs("management@workspace.test");

    plainUserId = await seedUser("plain@workspace.test");
    plainUser = await loginAs("plain@workspace.test");

    const department = await prisma.department.create({
      data: { name: "Production" },
    });
    departmentId = department.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "put" | "delete",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function createWorkspace(
    principal: Principal = superAdmin,
    payload: Record<string, unknown> = { kind: "EVENT" },
  ): Promise<WorkspaceBody> {
    const response = await as(principal, "post", "/api/v1/workspaces").send(
      payload,
    );
    expect(response.status).toBe(201);
    return body<WorkspaceBody>(response);
  }

  async function createTeam(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/teams").send({
      name: `Team ${Math.random().toString(36).slice(2)}`,
      departmentId,
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  async function createUser(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/users").send({
      email: `member-${Math.random().toString(36).slice(2)}@workspace.test`,
      firstName: "Mem",
      lastName: "Ber",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("authentication, CSRF, and authorization by kind", () => {
    it("rejects an unauthenticated request", async () => {
      expect(
        (await request(http).get("/api/v1/workspaces?kind=EVENT")).status,
      ).toBe(401);
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/workspaces")
        .set("Cookie", superAdmin.cookies)
        .send({ kind: "EVENT" });
      expect(response.status).toBe(403);
    });

    it("denies a user without the owning module's permission", async () => {
      const response = await as(plainUser, "post", "/api/v1/workspaces").send({
        kind: "EVENT",
      });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      expect(await prisma.workspace.count()).toBe(0);
    });

    it("lets Management/Administrator create and assign, but not delete", async () => {
      const created = await createWorkspace(management, { kind: "EVENT" });

      const teamId = await createTeam();
      const assigned = await as(
        management,
        "put",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      expect(assigned.status).toBe(200);
      expect(body<WorkspaceBody>(assigned).teams).toHaveLength(1);

      // Management/Administrator holds event.assign_* but not event.delete.
      const deleted = await as(
        management,
        "delete",
        `/api/v1/workspaces/${created.id}`,
      );
      expect(deleted.status).toBe(403);
      expect(body<ProblemBody>(deleted).code).toBe("PERMISSION_DENIED");
    });

    it("checks project.* keys for PRODUCTION as well as PROJECT", async () => {
      for (const kind of ["PROJECT", "PRODUCTION"]) {
        const created = await createWorkspace(management, { kind });
        const got = await as(
          management,
          "get",
          `/api/v1/workspaces/${created.id}`,
        );
        expect(got.status).toBe(200);
        expect(body<WorkspaceBody>(got).kind).toBe(kind);
      }
    });
  });

  describe("create, read, and list", () => {
    it("creates a workspace and returns only the public contract", async () => {
      const managerId = await createUser();
      const response = await as(superAdmin, "post", "/api/v1/workspaces").send({
        kind: "CAMPAIGN",
        managerId,
      });
      expect(response.status).toBe(201);
      const created = body<WorkspaceBody>(response);

      expect(created.kind).toBe("CAMPAIGN");
      expect(created.manager?.id).toBe(managerId);
      expect(created.teams).toEqual([]);
      expect(created.participants).toEqual([]);
      expect(Object.keys(created).sort()).toEqual(WORKSPACE_KEYS);
    });

    it("404s an unknown manager on create and writes nothing", async () => {
      const before = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/workspaces").send({
        kind: "EVENT",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.workspace.count()).toBe(before);
    });

    it("gets one workspace and 404s an unknown id", async () => {
      const created = await createWorkspace();
      const found = await as(
        superAdmin,
        "get",
        `/api/v1/workspaces/${created.id}`,
      );
      expect(found.status).toBe(200);
      expect(body<WorkspaceBody>(found).id).toBe(created.id);

      const missing = await as(superAdmin, "get", `/api/v1/workspaces/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("WORKSPACE_NOT_FOUND");
    });

    it("requires kind on the list and filters by it", async () => {
      await createWorkspace(superAdmin, { kind: "EVENT" });
      await createWorkspace(superAdmin, { kind: "CAMPAIGN" });

      const noKind = await as(superAdmin, "get", "/api/v1/workspaces");
      expect(noKind.status).toBe(400);
      expect(body<ProblemBody>(noKind).code).toBe("VALIDATION_ERROR");

      const page = await as(
        superAdmin,
        "get",
        "/api/v1/workspaces?kind=CAMPAIGN&pageSize=100",
      );
      expect(page.status).toBe(200);
      const pageBody = body<PageBody>(page);
      expect(pageBody.items.length).toBeGreaterThan(0);
      expect(pageBody.items.every((w) => w.kind === "CAMPAIGN")).toBe(true);
      expect(Object.keys(pageBody.items[0]!).sort()).toEqual(WORKSPACE_KEYS);
    });

    it("filters the list by managerId", async () => {
      const managerId = await createUser();
      const mine = await createWorkspace(superAdmin, {
        kind: "PROJECT",
        managerId,
      });
      await createWorkspace(superAdmin, { kind: "PROJECT" });

      const page = await as(
        superAdmin,
        "get",
        `/api/v1/workspaces?kind=PROJECT&managerId=${managerId}`,
      );
      expect(page.status).toBe(200);
      const items = body<PageBody>(page).items;
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe(mine.id);
    });
  });

  describe("manager, teams, and participants", () => {
    it("sets and clears the manager, 404ing an unknown user", async () => {
      const created = await createWorkspace();

      const set = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/manager`,
      ).send({ managerId: plainUserId });
      expect(set.status).toBe(200);
      expect(body<WorkspaceBody>(set).manager?.id).toBe(plainUserId);

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<WorkspaceBody>(cleared).manager).toBeNull();

      const ghost = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");
    });

    it("assigns a team idempotently, then unassigns it with a 409 on repeat", async () => {
      const created = await createWorkspace();
      const teamId = await createTeam();

      const first = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      expect(first.status).toBe(200);
      expect(body<WorkspaceBody>(first).teams.map((t) => t.id)).toEqual([
        teamId,
      ]);

      const again = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      expect(again.status).toBe(200);
      expect(body<WorkspaceBody>(again).teams).toHaveLength(1);

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<WorkspaceBody>(removed).teams).toEqual([]);

      const removedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      expect(removedAgain.status).toBe(409);
      expect(body<ProblemBody>(removedAgain).code).toBe(
        "WORKSPACE_TEAM_NOT_ASSIGNED",
      );
    });

    it("404s assigning an unknown team", async () => {
      const created = await createWorkspace();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/teams/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("WORKSPACE_TEAM_NOT_FOUND");
    });

    it("adds a participant idempotently, then removes with a 409 on repeat", async () => {
      const created = await createWorkspace();
      const userId = await createUser();

      const first = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/participants/${userId}`,
      );
      expect(first.status).toBe(200);
      expect(body<WorkspaceBody>(first).participants.map((p) => p.id)).toEqual([
        userId,
      ]);

      const again = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/participants/${userId}`,
      );
      expect(again.status).toBe(200);
      expect(body<WorkspaceBody>(again).participants).toHaveLength(1);

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${created.id}/participants/${userId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<WorkspaceBody>(removed).participants).toEqual([]);

      const removedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${created.id}/participants/${userId}`,
      );
      expect(removedAgain.status).toBe(409);
      expect(body<ProblemBody>(removedAgain).code).toBe(
        "WORKSPACE_PARTICIPANT_NOT_FOUND",
      );
    });

    it("404s adding an unknown participant", async () => {
      const created = await createWorkspace();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/participants/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
    });
  });

  describe("deletion", () => {
    it("deletes a workspace and cascades its team and participant rows", async () => {
      const created = await createWorkspace();
      const teamId = await createTeam();
      const userId = await createUser();
      await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/teams/${teamId}`,
      );
      await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/participants/${userId}`,
      );

      const deleted = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${created.id}`,
      );
      expect(deleted.status).toBe(204);

      expect(
        await prisma.workspace.findUnique({ where: { id: created.id } }),
      ).toBeNull();
      expect(
        await prisma.workspaceTeam.count({
          where: { workspaceId: created.id },
        }),
      ).toBe(0);
      expect(
        await prisma.workspaceParticipant.count({
          where: { workspaceId: created.id },
        }),
      ).toBe(0);
      // The team and the user survive; only the join rows are gone.
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).not.toBeNull();
    });

    it("404s deleting an unknown workspace", async () => {
      const response = await as(
        superAdmin,
        "delete",
        `/api/v1/workspaces/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("WORKSPACE_NOT_FOUND");
    });
  });

  describe("request validation and transport", () => {
    it.each([
      ["an unknown kind", { kind: "MEETING" }],
      ["a missing kind", {}],
      ["a manager id that is not a uuid", { kind: "EVENT", managerId: "nope" }],
    ])("400s %s with VALIDATION_ERROR", async (_label, payload) => {
      const response = await as(superAdmin, "post", "/api/v1/workspaces").send(
        payload,
      );
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("requires an explicit managerId on the manager route", async () => {
      const created = await createWorkspace();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${created.id}/manager`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("echoes the incoming x-request-id", async () => {
      const response = await as(
        superAdmin,
        "get",
        "/api/v1/workspaces?kind=EVENT",
      ).set("x-request-id", "workspace-req-id-check");
      expect(response.headers["x-request-id"]).toBe("workspace-req-id-check");
    });
  });
});
