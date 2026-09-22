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

interface EventBody {
  id: string;
  workspaceId: string;
  name: string;
  eventType: string;
  description: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  organizerName: string | null;
  manager: PersonSummary | null;
  teams: { id: string; name: string }[];
  participants: PersonSummary[];
  createdBy: PersonSummary | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: EventBody[];
  page: number;
  pageSize: number;
  total: number;
}

const EVENT_KEYS = [
  "createdAt",
  "createdBy",
  "description",
  "endAt",
  "eventType",
  "id",
  "location",
  "manager",
  "name",
  "organizerName",
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

describe("event management API", () => {
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
      "events-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "events-refresh-token-secret-at-least-32-chars";
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

    const superAdminId = await seedUser("super-admin@events.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@events.test");

    const managementId = await seedUser("management@events.test");
    await assignRole(managementId, "Management/Administrator");
    management = await loginAs("management@events.test");

    await seedUser("plain@events.test");
    plainUser = await loginAs("plain@events.test");

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

  async function createEvent(
    principal: Principal = superAdmin,
    payload: Record<string, unknown> = {},
  ): Promise<EventBody> {
    const response = await as(principal, "post", "/api/v1/events").send({
      name: `Event ${Math.random().toString(36).slice(2)}`,
      eventType: "CONCERT",
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<EventBody>(response);
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
      email: `member-${Math.random().toString(36).slice(2)}@events.test`,
      firstName: "Mem",
      lastName: "Ber",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("authentication, CSRF, and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await request(http).get("/api/v1/events")).status).toBe(401);
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/events")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No CSRF", eventType: "CONCERT" });
      expect(response.status).toBe(403);
    });

    it("denies a user without event permissions and writes nothing", async () => {
      const before = await prisma.event.count();
      const response = await as(plainUser, "post", "/api/v1/events").send({
        name: "Denied",
        eventType: "CONCERT",
      });
      expect(response.status).toBe(403);
      expect(await prisma.event.count()).toBe(before);
    });

    it("denies list and read for a user without event permissions", async () => {
      const list = await as(plainUser, "get", "/api/v1/events");
      expect(list.status).toBe(403);

      const created = await createEvent();
      const read = await as(plainUser, "get", `/api/v1/events/${created.id}`);
      expect(read.status).toBe(403);
    });

    it("lets Management/Administrator create but not delete", async () => {
      const created = await createEvent(management);
      const deleted = await as(
        management,
        "delete",
        `/api/v1/events/${created.id}`,
      );
      expect(deleted.status).toBe(403);
      expect(body<ProblemBody>(deleted).code).toBe("PERMISSION_DENIED");
    });
  });

  describe("create, read, and list", () => {
    it("creates an event with its workspace and returns only the public contract", async () => {
      const managerId = await createUser();
      const response = await as(superAdmin, "post", "/api/v1/events").send({
        name: "Autumn Launch",
        eventType: "PRODUCT_LAUNCH",
        description: "  Partners and press.  ",
        startAt: "2026-10-01T18:00:00.000Z",
        endAt: "2026-10-01T22:00:00.000Z",
        location: "Grand Hall",
        organizerName: "City Arts Council",
        managerId,
      });
      expect(response.status).toBe(201);
      const created = body<EventBody>(response);

      expect(created.name).toBe("Autumn Launch");
      expect(created.eventType).toBe("PRODUCT_LAUNCH");
      expect(created.status).toBe("PLANNING");
      expect(created.description).toBe("Partners and press.");
      expect(created.startAt).toBe("2026-10-01T18:00:00.000Z");
      expect(created.manager?.id).toBe(managerId);
      expect(created.teams).toEqual([]);
      expect(created.participants).toEqual([]);
      expect(created.createdBy?.email).toBe("super-admin@events.test");
      expect(Object.keys(created).sort()).toEqual(EVENT_KEYS);
      expect(created).not.toHaveProperty("budgetAmount");

      const workspace = await prisma.workspace.findUnique({
        where: { id: created.workspaceId },
      });
      expect(workspace?.kind).toBe("EVENT");
      expect(workspace?.managerId).toBe(managerId);
    });

    it("404s an unknown manager on create and writes nothing", async () => {
      const events = await prisma.event.count();
      const workspaces = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/events").send({
        name: "Ghost Manager",
        eventType: "CONCERT",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.event.count()).toBe(events);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("gets one event and 404s an unknown id", async () => {
      const created = await createEvent();
      const found = await as(superAdmin, "get", `/api/v1/events/${created.id}`);
      expect(found.status).toBe(200);
      expect(body<EventBody>(found).id).toBe(created.id);
      expect(Object.keys(body<EventBody>(found)).sort()).toEqual(EVENT_KEYS);

      const missing = await as(superAdmin, "get", `/api/v1/events/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("EVENT_NOT_FOUND");
    });

    it("filters the list by status, type, manager, and name", async () => {
      const managerId = await createUser();
      const target = await createEvent(superAdmin, {
        name: "Filter Target Gala",
        eventType: "CORPORATE_EVENT",
        managerId,
      });
      await createEvent(superAdmin, { name: "Other", eventType: "CONCERT" });

      const byType = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?eventType=CORPORATE_EVENT&pageSize=100",
        ),
      );
      expect(byType.items.every((e) => e.eventType === "CORPORATE_EVENT")).toBe(
        true,
      );

      const byManager = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/events?managerId=${managerId}&pageSize=100`,
        ),
      );
      expect(byManager.items.map((e) => e.id)).toContain(target.id);
      expect(byManager.items.every((e) => e.manager?.id === managerId)).toBe(
        true,
      );

      const bySearch = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?search=filter%20target&pageSize=100",
        ),
      );
      expect(bySearch.items.map((e) => e.id)).toEqual([target.id]);

      const byStatus = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?status=PLANNING&pageSize=100",
        ),
      );
      expect(byStatus.items.every((e) => e.status === "PLANNING")).toBe(true);
    });

    it("filters the list by a start-time window", async () => {
      const early = await createEvent(superAdmin, {
        name: "Early Window Show",
        startAt: "2027-01-01T00:00:00.000Z",
      });
      const late = await createEvent(superAdmin, {
        name: "Late Window Show",
        startAt: "2027-12-31T00:00:00.000Z",
      });

      const page = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?startingAfter=2027-06-01T00:00:00.000Z&pageSize=100",
        ),
      );
      const ids = page.items.map((e) => e.id);
      expect(ids).toContain(late.id);
      expect(ids).not.toContain(early.id);
    });

    it.each([
      ["a non-integer page", "/api/v1/events?page=abc"],
      ["pageSize over the maximum", "/api/v1/events?pageSize=101"],
      ["an unknown status", "/api/v1/events?status=ARCHIVED"],
      ["an unknown type", "/api/v1/events?eventType=GALA"],
      ["a non-uuid managerId", "/api/v1/events?managerId=nope"],
      ["a malformed startingAfter", "/api/v1/events?startingAfter=soon"],
    ])("400s %s with VALIDATION_ERROR", async (_label, path) => {
      const response = await as(superAdmin, "get", path);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("keeps total stable and items disjoint across pages", async () => {
      for (let i = 0; i < 3; i += 1) {
        await createEvent(superAdmin, {
          name: `Paged ${i} ${Math.random().toString(36).slice(2)}`,
          eventType: "PROMOTIONAL_EVENT",
        });
      }
      const p1 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?eventType=PROMOTIONAL_EVENT&page=1&pageSize=2",
        ),
      );
      const p2 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/events?eventType=PROMOTIONAL_EVENT&page=2&pageSize=2",
        ),
      );
      expect(p1.total).toBe(p2.total);
      expect(p1.total).toBeGreaterThanOrEqual(3);
      const ids = new Set([
        ...p1.items.map((e) => e.id),
        ...p2.items.map((e) => e.id),
      ]);
      expect(ids.size).toBe(p1.items.length + p2.items.length);
    });
  });

  describe("update", () => {
    it("patches fields, clears a nullable one, and leaves the rest", async () => {
      const created = await createEvent(superAdmin, {
        description: "First",
        location: "Hall A",
      });

      const patched = await as(
        superAdmin,
        "patch",
        `/api/v1/events/${created.id}`,
      ).send({ name: "Renamed", description: null });
      expect(patched.status).toBe(200);
      const bodyOut = body<EventBody>(patched);
      expect(bodyOut.name).toBe("Renamed");
      expect(bodyOut.description).toBeNull();
      expect(bodyOut.location).toBe("Hall A");
    });

    it("400s a patch whose end would precede the start", async () => {
      const created = await createEvent(superAdmin, {
        startAt: "2026-05-10T00:00:00.000Z",
      });
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/events/${created.id}`,
      ).send({ endAt: "2026-05-01T00:00:00.000Z" });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("EVENT_SCHEDULE_INVALID");
    });

    it("404s a patch to an unknown event", async () => {
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/events/${UUID}`,
      ).send({ name: "x" });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
    });

    it("400s a blank name", async () => {
      const created = await createEvent();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/events/${created.id}`,
      ).send({ name: "   " });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("lifecycle transitions", () => {
    it("moves along the approved graph and rejects an illegal move", async () => {
      const created = await createEvent();

      const ready = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "READY" });
      expect(ready.status).toBe(200);
      expect(body<EventBody>(ready).status).toBe("READY");

      const illegal = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(illegal.status).toBe(409);
      expect(body<ProblemBody>(illegal).code).toBe("EVENT_INVALID_TRANSITION");

      const inProgress = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "IN_PROGRESS" });
      expect(inProgress.status).toBe(200);

      const done = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(done.status).toBe(200);

      const reopen = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "IN_PROGRESS" });
      expect(reopen.status).toBe(409);
    });

    it("400s an unknown target status and 404s an unknown event", async () => {
      const created = await createEvent();
      const bad = await as(
        superAdmin,
        "post",
        `/api/v1/events/${created.id}/transition`,
      ).send({ status: "ARCHIVED" });
      expect(bad.status).toBe(400);
      expect(body<ProblemBody>(bad).code).toBe("VALIDATION_ERROR");

      const ghost = await as(
        superAdmin,
        "post",
        `/api/v1/events/${UUID}/transition`,
      ).send({ status: "READY" });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("EVENT_NOT_FOUND");
    });

    it("lets exactly one of two racing transitions win and never reopens a cancelled event", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const created = await createEvent();

        const responses = await Promise.all([
          as(
            superAdmin,
            "post",
            `/api/v1/events/${created.id}/transition`,
          ).send({ status: "CANCELLED" }),
          as(
            superAdmin,
            "post",
            `/api/v1/events/${created.id}/transition`,
          ).send({ status: "READY" }),
        ]);

        const statuses = responses.map((response) => response.status).sort();
        expect(statuses).toEqual([200, 409]);
        const loser = responses.find((response) => response.status === 409);
        expect(body<ProblemBody>(loser!).code).toBe("EVENT_INVALID_TRANSITION");
        const winner = responses.find((response) => response.status === 200);
        const read = await as(
          superAdmin,
          "get",
          `/api/v1/events/${created.id}`,
        );
        expect(body<EventBody>(read).status).toBe(
          body<EventBody>(winner!).status,
        );
      }
    });
  });

  describe("manager and teams", () => {
    it("sets and clears the manager, 404ing an unknown user", async () => {
      const created = await createEvent();
      const userId = await createUser();

      const set = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/manager`,
      ).send({ managerId: userId });
      expect(set.status).toBe(200);
      expect(body<EventBody>(set).manager?.id).toBe(userId);

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<EventBody>(cleared).manager).toBeNull();

      const ghost = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");
    });

    it("assigns a team idempotently, then unassigns with a 409 on repeat", async () => {
      const created = await createEvent();
      const teamId = await createTeam();

      const first = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/teams/${teamId}`,
      );
      expect(first.status).toBe(200);
      expect(body<EventBody>(first).teams.map((t) => t.id)).toEqual([teamId]);

      const again = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/teams/${teamId}`,
      );
      expect(again.status).toBe(200);
      expect(body<EventBody>(again).teams).toHaveLength(1);

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${created.id}/teams/${teamId}`,
      );
      expect(removed.status).toBe(200);
      expect(body<EventBody>(removed).teams).toEqual([]);

      const removedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${created.id}/teams/${teamId}`,
      );
      expect(removedAgain.status).toBe(409);
      expect(body<ProblemBody>(removedAgain).code).toBe(
        "EVENT_TEAM_NOT_ASSIGNED",
      );
    });

    it("404s assigning an unknown team", async () => {
      const created = await createEvent();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/teams/${UUID}`,
      );
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_TEAM_NOT_FOUND");
    });
  });

  describe("budget (sensitive)", () => {
    it("reads null before any budget is set", async () => {
      const created = await createEvent(management);
      const response = await as(
        management,
        "get",
        `/api/v1/events/${created.id}/budget`,
      );
      expect(response.status).toBe(200);
      expect(body<Record<string, unknown>>(response)).toEqual({
        amount: null,
        currency: null,
      });
    });

    it("sets, reads back, and clears a budget", async () => {
      const created = await createEvent(management);

      const set = await as(
        management,
        "put",
        `/api/v1/events/${created.id}/budget`,
      ).send({ amount: 15000, currency: "USD" });
      expect(set.status).toBe(200);
      expect(body<Record<string, unknown>>(set)).toEqual({
        amount: "15000.00",
        currency: "USD",
      });

      const read = await as(
        management,
        "get",
        `/api/v1/events/${created.id}/budget`,
      );
      expect(body<Record<string, unknown>>(read)).toEqual({
        amount: "15000.00",
        currency: "USD",
      });

      const cleared = await as(
        management,
        "put",
        `/api/v1/events/${created.id}/budget`,
      ).send({ amount: null, currency: null });
      expect(cleared.status).toBe(200);
      expect(body<Record<string, unknown>>(cleared)).toEqual({
        amount: null,
        currency: null,
      });
    });

    it.each([
      ["an amount without a currency", { amount: 100, currency: null }],
      ["a currency without an amount", { amount: null, currency: "USD" }],
    ])("400s %s with EVENT_BUDGET_INCOMPLETE", async (_label, payload) => {
      const created = await createEvent(management);
      const response = await as(
        management,
        "put",
        `/api/v1/events/${created.id}/budget`,
      ).send(payload);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("EVENT_BUDGET_INCOMPLETE");
    });

    it.each([
      ["a negative amount", { amount: -1, currency: "USD" }],
      ["too many fraction digits", { amount: 1.234, currency: "USD" }],
      ["a lower-case currency", { amount: 10, currency: "usd" }],
    ])("400s %s with VALIDATION_ERROR", async (_label, payload) => {
      const created = await createEvent(management);
      const response = await as(
        management,
        "put",
        `/api/v1/events/${created.id}/budget`,
      ).send(payload);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("denies budget access to a user without the budget keys", async () => {
      const created = await createEvent();
      expect(
        (await as(plainUser, "get", `/api/v1/events/${created.id}/budget`))
          .status,
      ).toBe(403);
      expect(
        (
          await as(
            plainUser,
            "put",
            `/api/v1/events/${created.id}/budget`,
          ).send({ amount: 1, currency: "USD" })
        ).status,
      ).toBe(403);
    });

    it("never exposes the budget through the event contract", async () => {
      const created = await createEvent(management);
      await as(management, "put", `/api/v1/events/${created.id}/budget`).send({
        amount: 42,
        currency: "GBP",
      });
      const event = body<EventBody>(
        await as(management, "get", `/api/v1/events/${created.id}`),
      );
      expect(Object.keys(event).sort()).toEqual(EVENT_KEYS);
      expect(JSON.stringify(event)).not.toContain("GBP");
    });
  });

  describe("deletion", () => {
    it("deletes the event and its workspace, sparing the team and users", async () => {
      const created = await createEvent();
      const teamId = await createTeam();
      const userId = await createUser();
      await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/teams/${teamId}`,
      );
      await as(superAdmin, "put", `/api/v1/events/${created.id}/manager`).send({
        managerId: userId,
      });

      const deleted = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${created.id}`,
      );
      expect(deleted.status).toBe(204);

      expect(
        await prisma.event.findUnique({ where: { id: created.id } }),
      ).toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: created.workspaceId },
        }),
      ).toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).not.toBeNull();
    });

    it("404s deleting an unknown event", async () => {
      const response = await as(superAdmin, "delete", `/api/v1/events/${UUID}`);
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
    });
  });

  describe("request validation and transport", () => {
    it.each([
      ["a missing name", { eventType: "CONCERT" }],
      ["a blank name", { name: "  ", eventType: "CONCERT" }],
      ["a missing type", { name: "x" }],
      ["an unknown type", { name: "x", eventType: "PARTY" }],
      [
        "a non-uuid managerId",
        { name: "x", eventType: "CONCERT", managerId: "no" },
      ],
      [
        "a malformed startAt",
        { name: "x", eventType: "CONCERT", startAt: "soon" },
      ],
    ])("400s create with %s", async (_label, payload) => {
      const response = await as(superAdmin, "post", "/api/v1/events").send(
        payload,
      );
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("requires an explicit managerId on the manager route", async () => {
      const created = await createEvent();
      const response = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/manager`,
      ).send({});
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("treats a non-uuid :id as not-found, never a 500", async () => {
      for (const [method, path] of [
        ["get", "/api/v1/events/not-a-uuid"],
        ["patch", "/api/v1/events/not-a-uuid"],
        ["delete", "/api/v1/events/not-a-uuid"],
        ["get", "/api/v1/events/not-a-uuid/budget"],
      ] as const) {
        const req = as(superAdmin, method, path);
        const response =
          method === "patch" ? await req.send({ name: "x" }) : await req;
        expect(response.status).toBe(404);
        expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
      }
    });

    it("treats a non-uuid :teamId as not-found", async () => {
      const created = await createEvent();
      const assign = await as(
        superAdmin,
        "put",
        `/api/v1/events/${created.id}/teams/not-a-uuid`,
      );
      expect(assign.status).toBe(404);
      expect(body<ProblemBody>(assign).code).toBe("EVENT_TEAM_NOT_FOUND");

      const unassign = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${created.id}/teams/not-a-uuid`,
      );
      expect(unassign.status).toBe(409);
      expect(body<ProblemBody>(unassign).code).toBe("EVENT_TEAM_NOT_ASSIGNED");
    });

    it("returns a full Problem Details body and echoes x-request-id", async () => {
      const response = await as(
        superAdmin,
        "get",
        `/api/v1/events/${UUID}`,
      ).set("x-request-id", "events-error-id");
      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.headers["x-request-id"]).toBe("events-error-id");
      const problem = response.body as Record<string, unknown>;
      expect(problem).toMatchObject({
        code: "EVENT_NOT_FOUND",
        status: 404,
        title: "Not Found",
        instance: `/api/v1/events/${UUID}`,
      });
      expect(typeof problem.type).toBe("string");
      expect(typeof problem.detail).toBe("string");
      expect(typeof problem.requestId).toBe("string");
    });

    it("echoes x-request-id on a successful mutation", async () => {
      const created = await createEvent();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/events/${created.id}`,
      )
        .set("x-request-id", "events-mutation-id")
        .send({ name: "Echo" });
      expect(response.headers["x-request-id"]).toBe("events-mutation-id");
    });
  });
});
