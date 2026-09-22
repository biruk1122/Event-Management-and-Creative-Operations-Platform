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

interface PersonSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface ProjectBody {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  eventId: string | null;
  manager: PersonSummary | null;
  teams: { id: string; name: string }[];
  participants: PersonSummary[];
  createdBy: PersonSummary | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: ProjectBody[];
  page: number;
  pageSize: number;
  total: number;
}

const PROJECT_KEYS = [
  "createdAt",
  "createdBy",
  "description",
  "endAt",
  "eventId",
  "id",
  "manager",
  "name",
  "participants",
  "startAt",
  "status",
  "teams",
  "updatedAt",
  "workspaceId",
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

describe("general project management API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let management: Principal;
  let plainUser: Principal;
  let credentialHash: string;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "projects-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "projects-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    // This suite drives many requests from one IP; keep the general per-IP
    // limiter out of the way so it does not 429 an unrelated assertion.
    process.env.API_RATE_LIMIT_MAX = "100000";

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

    const superAdminId = await seedUser("super-admin@projects.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@projects.test");

    const managementId = await seedUser("management@projects.test");
    await assignRole(managementId, "Management/Administrator");
    management = await loginAs("management@projects.test");

    await seedUser("plain@projects.test");
    plainUser = await loginAs("plain@projects.test");

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
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function createProject(
    principal: Principal = superAdmin,
    payload: Record<string, unknown> = {},
  ): Promise<ProjectBody> {
    const response = await as(principal, "post", "/api/v1/projects").send({
      name: `Project ${Math.random().toString(36).slice(2)}`,
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<ProjectBody>(response);
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
      email: `member-${Math.random().toString(36).slice(2)}@projects.test`,
      firstName: "Mem",
      lastName: "Ber",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  async function createEvent(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/events").send({
      name: `Event ${Math.random().toString(36).slice(2)}`,
      eventType: "CONCERT",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("authentication, CSRF, and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await request(http).get("/api/v1/projects")).status).toBe(401);
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/projects")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No CSRF" });
      expect(response.status).toBe(403);
    });

    it("denies a user without project permissions and writes nothing", async () => {
      const before = await prisma.project.count();
      const response = await as(plainUser, "post", "/api/v1/projects").send({
        name: "Denied",
      });
      expect(response.status).toBe(403);
      expect(await prisma.project.count()).toBe(before);
    });

    it("denies list and read for a user without project permissions", async () => {
      const list = await as(plainUser, "get", "/api/v1/projects");
      expect(list.status).toBe(403);

      const created = await createProject();
      const read = await as(plainUser, "get", `/api/v1/projects/${created.id}`);
      expect(read.status).toBe(403);
    });

    it("lets Management/Administrator create but not delete", async () => {
      const created = await createProject(management);
      const deleted = await as(
        management,
        "delete",
        `/api/v1/projects/${created.id}`,
      );
      expect(deleted.status).toBe(403);
      expect(body<ProblemBody>(deleted).code).toBe("PERMISSION_DENIED");
    });
  });

  describe("create, read, and list", () => {
    it("creates a project with its workspace and returns only the public contract", async () => {
      const managerId = await createUser();
      const eventId = await createEvent();
      const response = await as(superAdmin, "post", "/api/v1/projects").send({
        name: "Brand Refresh",
        description: "  Redesign the visual identity.  ",
        startAt: "2026-10-01T18:00:00.000Z",
        endAt: "2026-10-01T22:00:00.000Z",
        eventId,
        managerId,
      });
      expect(response.status).toBe(201);
      const created = body<ProjectBody>(response);

      expect(created.name).toBe("Brand Refresh");
      expect(created.status).toBe("PLANNED");
      expect(created.description).toBe("Redesign the visual identity.");
      expect(created.startAt).toBe("2026-10-01T18:00:00.000Z");
      expect(created.eventId).toBe(eventId);
      expect(created.manager?.id).toBe(managerId);
      expect(created.teams).toEqual([]);
      expect(created.participants).toEqual([]);
      expect(created.createdBy?.email).toBe("super-admin@projects.test");
      expect(Object.keys(created).sort()).toEqual(PROJECT_KEYS);

      const workspace = await prisma.workspace.findUnique({
        where: { id: created.workspaceId },
      });
      expect(workspace?.kind).toBe("PROJECT");
      expect(workspace?.managerId).toBe(managerId);
    });

    it("404s an unknown manager on create and writes nothing", async () => {
      const projects = await prisma.project.count();
      const workspaces = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/projects").send({
        name: "Ghost Manager",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.project.count()).toBe(projects);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("404s an unknown related event on create and writes nothing", async () => {
      const projects = await prisma.project.count();
      const workspaces = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/projects").send({
        name: "Ghost Event",
        eventId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
      expect(await prisma.project.count()).toBe(projects);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("gets one project and 404s an unknown id", async () => {
      const created = await createProject();
      const found = await as(
        superAdmin,
        "get",
        `/api/v1/projects/${created.id}`,
      );
      expect(found.status).toBe(200);
      expect(body<ProjectBody>(found).id).toBe(created.id);
      expect(Object.keys(body<ProjectBody>(found)).sort()).toEqual(
        PROJECT_KEYS,
      );

      const missing = await as(superAdmin, "get", `/api/v1/projects/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("PROJECT_NOT_FOUND");
    });

    it("filters the list by status, event, manager, and name", async () => {
      const managerId = await createUser();
      const eventId = await createEvent();
      const target = await createProject(superAdmin, {
        name: "Filter Target Rollout",
        eventId,
        managerId,
      });
      await createProject(superAdmin, { name: "Other" });

      const byEvent = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/projects?eventId=${eventId}&pageSize=100`,
        ),
      );
      expect(byEvent.items.map((p) => p.id)).toEqual([target.id]);

      const byManager = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/projects?managerId=${managerId}&pageSize=100`,
        ),
      );
      expect(byManager.items.map((p) => p.id)).toContain(target.id);
      expect(byManager.items.every((p) => p.manager?.id === managerId)).toBe(
        true,
      );

      const bySearch = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/projects?search=filter%20target&pageSize=100",
        ),
      );
      expect(bySearch.items.map((p) => p.id)).toEqual([target.id]);

      const byStatus = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/projects?status=PLANNED&pageSize=100",
        ),
      );
      expect(byStatus.items.every((p) => p.status === "PLANNED")).toBe(true);
    });

    it("filters the list by a start-time window", async () => {
      const early = await createProject(superAdmin, {
        name: "Early Window Rollout",
        startAt: "2027-01-01T00:00:00.000Z",
      });
      const late = await createProject(superAdmin, {
        name: "Late Window Rollout",
        startAt: "2027-12-31T00:00:00.000Z",
      });

      const page = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/projects?startingAfter=2027-06-01T00:00:00.000Z&pageSize=100",
        ),
      );
      const ids = page.items.map((p) => p.id);
      expect(ids).toContain(late.id);
      expect(ids).not.toContain(early.id);
    });

    it.each([
      ["a non-integer page", "/api/v1/projects?page=abc"],
      ["pageSize over the maximum", "/api/v1/projects?pageSize=101"],
      ["an unknown status", "/api/v1/projects?status=ARCHIVED"],
      ["a non-uuid managerId", "/api/v1/projects?managerId=nope"],
      ["a non-uuid eventId", "/api/v1/projects?eventId=nope"],
      ["a malformed startingAfter", "/api/v1/projects?startingAfter=soon"],
    ])("400s %s with VALIDATION_ERROR", async (_label, path) => {
      const response = await as(superAdmin, "get", path);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("keeps total stable and items disjoint across pages", async () => {
      const marker = Math.random().toString(36).slice(2);
      for (let i = 0; i < 3; i += 1) {
        await createProject(superAdmin, {
          name: `Paged ${marker} ${i}`,
        });
      }
      const p1 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/projects?search=${marker}&page=1&pageSize=2`,
        ),
      );
      const p2 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/projects?search=${marker}&page=2&pageSize=2`,
        ),
      );
      expect(p1.total).toBe(p2.total);
      expect(p1.total).toBe(3);
      const ids = new Set([
        ...p1.items.map((p) => p.id),
        ...p2.items.map((p) => p.id),
      ]);
      expect(ids.size).toBe(p1.items.length + p2.items.length);
    });
  });

  describe("update", () => {
    it("patches fields, clears a nullable one, and leaves the rest", async () => {
      const created = await createProject(superAdmin, {
        description: "First",
      });

      const patched = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ name: "Renamed", description: null });
      expect(patched.status).toBe(200);
      const bodyOut = body<ProjectBody>(patched);
      expect(bodyOut.name).toBe("Renamed");
      expect(bodyOut.description).toBeNull();
    });

    it("sets and clears the related event via patch, 404ing an unknown one", async () => {
      const created = await createProject();
      const eventId = await createEvent();

      const set = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ eventId });
      expect(set.status).toBe(200);
      expect(body<ProjectBody>(set).eventId).toBe(eventId);

      const cleared = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ eventId: null });
      expect(cleared.status).toBe(200);
      expect(body<ProjectBody>(cleared).eventId).toBeNull();

      const ghost = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ eventId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("EVENT_NOT_FOUND");
    });

    it("400s a patch whose end would precede the start", async () => {
      const created = await createProject(superAdmin, {
        startAt: "2026-05-10T00:00:00.000Z",
      });
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ endAt: "2026-05-01T00:00:00.000Z" });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("PROJECT_SCHEDULE_INVALID");
    });

    it("404s a patch to an unknown project", async () => {
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${UUID}`,
      ).send({ name: "x" });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("PROJECT_NOT_FOUND");
    });

    it("400s a blank name", async () => {
      const created = await createProject();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      ).send({ name: "   " });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("lifecycle transitions", () => {
    it("moves along the approved graph and rejects an illegal move", async () => {
      const created = await createProject();

      const active = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${created.id}/transition`,
      ).send({ status: "ACTIVE" });
      expect(active.status).toBe(200);
      expect(body<ProjectBody>(active).status).toBe("ACTIVE");

      const illegal = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${created.id}/transition`,
      ).send({ status: "PLANNED" });
      expect(illegal.status).toBe(409);
      expect(body<ProblemBody>(illegal).code).toBe(
        "PROJECT_INVALID_TRANSITION",
      );

      const done = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${created.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(done.status).toBe(200);

      const reopen = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${created.id}/transition`,
      ).send({ status: "ACTIVE" });
      expect(reopen.status).toBe(409);
    });

    it("400s an unknown target status and 404s an unknown project", async () => {
      const created = await createProject();
      const bad = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${created.id}/transition`,
      ).send({ status: "ARCHIVED" });
      expect(bad.status).toBe(400);
      expect(body<ProblemBody>(bad).code).toBe("VALIDATION_ERROR");

      const ghost = await as(
        superAdmin,
        "post",
        `/api/v1/projects/${UUID}/transition`,
      ).send({ status: "ACTIVE" });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("PROJECT_NOT_FOUND");
    });

    it("lets exactly one of two racing transitions win and never reopens a cancelled project", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const created = await createProject();

        const responses = await Promise.all([
          as(
            superAdmin,
            "post",
            `/api/v1/projects/${created.id}/transition`,
          ).send({ status: "CANCELLED" }),
          as(
            superAdmin,
            "post",
            `/api/v1/projects/${created.id}/transition`,
          ).send({ status: "ACTIVE" }),
        ]);

        const statuses = responses.map((response) => response.status).sort();
        expect(statuses).toEqual([200, 409]);
        const loser = responses.find((response) => response.status === 409);
        expect(body<ProblemBody>(loser!).code).toBe(
          "PROJECT_INVALID_TRANSITION",
        );
        const winner = responses.find((response) => response.status === 200);
        const read = await as(
          superAdmin,
          "get",
          `/api/v1/projects/${created.id}`,
        );
        expect(body<ProjectBody>(read).status).toBe(
          body<ProjectBody>(winner!).status,
        );
      }
    });
  });

  describe("manager and teams", () => {
    it("sets and clears the manager, 404ing an unknown user", async () => {
      const created = await createProject();
      const userId = await createUser();

      const set = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/manager`,
      ).send({ managerId: userId });
      expect(set.status).toBe(200);
      expect(body<ProjectBody>(set).manager?.id).toBe(userId);

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<ProjectBody>(cleared).manager).toBeNull();

      const ghost = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");
    });

    it("assigns a team idempotently, then unassigns with a 409 on repeat", async () => {
      const created = await createProject();
      const teamId = await createTeam();

      const first = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/teams/${teamId}`,
      );
      expect(first.status).toBe(200);
      expect(body<ProjectBody>(first).teams.map((t) => t.id)).toEqual([teamId]);

      const again = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/teams/${teamId}`,
      );
      expect(again.status).toBe(200);
      expect(body<ProjectBody>(again).teams).toHaveLength(1);

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/projects/${created.id}/teams/${teamId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<ProjectBody>(removed).teams).toEqual([]);

      const removedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/projects/${created.id}/teams/${teamId}`,
      );
      expect(removedAgain.status).toBe(409);
      expect(body<ProblemBody>(removedAgain).code).toBe(
        "PROJECT_TEAM_NOT_ASSIGNED",
      );
    });

    it("404s assigning an unknown team", async () => {
      const created = await createProject();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/teams/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("PROJECT_TEAM_NOT_FOUND");
    });

    it("denies manager and team assignment to a user without project.assign", async () => {
      const created = await createProject();
      const teamId = await createTeam();
      expect(
        (
          await as(
            plainUser,
            "put",
            `/api/v1/projects/${created.id}/manager`,
          ).send({ managerId: null })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            plainUser,
            "put",
            `/api/v1/projects/${created.id}/teams/${teamId}`,
          )
        ).status,
      ).toBe(403);
    });
  });

  describe("deletion", () => {
    it("deletes the project and its workspace, sparing the event, team, and users", async () => {
      const eventId = await createEvent();
      const created = await createProject(superAdmin, { eventId });
      const teamId = await createTeam();
      const userId = await createUser();
      await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/teams/${teamId}`,
      );
      await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/manager`,
      ).send({ managerId: userId });

      const deleted = await as(
        superAdmin,
        "delete",
        `/api/v1/projects/${created.id}`,
      );
      expect(deleted.status).toBe(204);

      expect(
        await prisma.project.findUnique({ where: { id: created.id } }),
      ).toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: created.workspaceId },
        }),
      ).toBeNull();
      expect(
        await prisma.event.findUnique({ where: { id: eventId } }),
      ).not.toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).not.toBeNull();
    });

    it("404s deleting an unknown project", async () => {
      const response = await as(
        superAdmin,
        "delete",
        `/api/v1/projects/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("PROJECT_NOT_FOUND");
    });
  });

  describe("request validation and transport", () => {
    it.each([
      ["a missing name", {}],
      ["a blank name", { name: "  " }],
      ["a non-uuid managerId", { name: "x", managerId: "no" }],
      ["a non-uuid eventId", { name: "x", eventId: "no" }],
      ["a malformed startAt", { name: "x", startAt: "soon" }],
    ])("400s create with %s", async (_label, payload) => {
      const response = await as(superAdmin, "post", "/api/v1/projects").send(
        payload,
      );
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("requires an explicit managerId on the manager route", async () => {
      const created = await createProject();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/manager`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("treats a non-uuid :id as not-found, never a 500", async () => {
      for (const [method, path] of [
        ["get", "/api/v1/projects/not-a-uuid"],
        ["patch", "/api/v1/projects/not-a-uuid"],
        ["delete", "/api/v1/projects/not-a-uuid"],
      ] as const) {
        const req = as(superAdmin, method, path);
        const response =
          method === "patch" ? await req.send({ name: "x" }) : await req;
        expect(response.status).toBe(404);
        expect(body<ProblemBody>(response).code).toBe("PROJECT_NOT_FOUND");
      }
    });

    it("treats a non-uuid :teamId as not-found", async () => {
      const created = await createProject();
      const assign = await as(
        superAdmin,
        "put",
        `/api/v1/projects/${created.id}/teams/not-a-uuid`,
      );
      expect(assign.status).toBe(404);
      expect(body<ProblemBody>(assign).code).toBe("PROJECT_TEAM_NOT_FOUND");

      const unassign = await as(
        superAdmin,
        "delete",
        `/api/v1/projects/${created.id}/teams/not-a-uuid`,
      );
      expect(unassign.status).toBe(409);
      expect(body<ProblemBody>(unassign).code).toBe(
        "PROJECT_TEAM_NOT_ASSIGNED",
      );
    });

    it("returns a full Problem Details body and echoes x-request-id", async () => {
      const response = await as(
        superAdmin,
        "get",
        `/api/v1/projects/${UUID}`,
      ).set("x-request-id", "projects-error-id");
      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.headers["x-request-id"]).toBe("projects-error-id");
      const problem = response.body as Record<string, unknown>;
      expect(problem).toMatchObject({
        code: "PROJECT_NOT_FOUND",
        status: 404,
        title: "Not Found",
        instance: `/api/v1/projects/${UUID}`,
      });
      expect(typeof problem.type).toBe("string");
      expect(typeof problem.detail).toBe("string");
      expect(typeof problem.requestId).toBe("string");
    });

    it("echoes x-request-id on a successful mutation", async () => {
      const created = await createProject();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/projects/${created.id}`,
      )
        .set("x-request-id", "projects-mutation-id")
        .send({ name: "Echo" });
      expect(response.headers["x-request-id"]).toBe("projects-mutation-id");
    });
  });
});
