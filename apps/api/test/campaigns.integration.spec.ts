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

interface CampaignBody {
  id: string;
  workspaceId: string;
  name: string;
  campaignType: string;
  description: string | null;
  audience: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  eventId: string | null;
  productName: string | null;
  progress: {
    completedActivities: number;
    totalActivities: number;
    percent: number | null;
  };
  manager: PersonSummary | null;
  teams: { id: string; name: string }[];
  participants: PersonSummary[];
  createdBy: PersonSummary | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityBody {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const CAMPAIGN_KEYS = [
  "audience",
  "campaignType",
  "createdAt",
  "createdBy",
  "description",
  "endAt",
  "eventId",
  "id",
  "manager",
  "name",
  "participants",
  "productName",
  "progress",
  "startAt",
  "status",
  "teams",
  "updatedAt",
  "workspaceId",
].sort();

const ACTIVITY_KEYS = [
  "campaignId",
  "createdAt",
  "description",
  "endAt",
  "id",
  "name",
  "startAt",
  "status",
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

describe("campaign platform API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let management: Principal;
  let plainUser: Principal;
  let readOnly: Principal;
  let credentialHash: string;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "campaigns-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "campaigns-refresh-token-secret-at-least-32-chars";
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

    const superAdminId = await seedUser("super-admin@campaigns.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@campaigns.test");

    const managementId = await seedUser("management@campaigns.test");
    await assignRole(managementId, "Management/Administrator");
    management = await loginAs("management@campaigns.test");

    await seedUser("plain@campaigns.test");
    plainUser = await loginAs("plain@campaigns.test");

    const readOnlyRole = await prisma.role.create({
      data: {
        name: "Campaign Read Only",
        rolePermissions: {
          create: [{ permissionKey: "campaign.read", scope: "ORGANIZATION" }],
        },
      },
    });
    const readOnlyId = await seedUser("read-only@campaigns.test");
    await prisma.userRoleAssignment.create({
      data: { userId: readOnlyId, roleId: readOnlyRole.id },
    });
    readOnly = await loginAs("read-only@campaigns.test");

    const department = await prisma.department.create({
      data: { name: "Marketing" },
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

  async function createCampaign(
    principal: Principal = superAdmin,
    payload: Record<string, unknown> = {},
  ): Promise<CampaignBody> {
    const response = await as(principal, "post", "/api/v1/campaigns").send({
      name: `Campaign ${Math.random().toString(36).slice(2)}`,
      campaignType: "MARKETING",
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<CampaignBody>(response);
  }

  async function createActivity(
    campaignId: string,
    payload: Record<string, unknown> = {},
  ): Promise<ActivityBody> {
    const response = await as(
      superAdmin,
      "post",
      `/api/v1/campaigns/${campaignId}/activities`,
    ).send({
      name: `Activity ${Math.random().toString(36).slice(2)}`,
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<ActivityBody>(response);
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
      email: `member-${Math.random().toString(36).slice(2)}@campaigns.test`,
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
      expect((await request(http).get("/api/v1/campaigns")).status).toBe(401);
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/campaigns")
        .set("Cookie", superAdmin.cookies)
        .send({ name: "No CSRF", campaignType: "MARKETING" });
      expect(response.status).toBe(403);
    });

    it("denies a user without campaign permissions and writes nothing", async () => {
      const before = await prisma.campaign.count();
      const response = await as(plainUser, "post", "/api/v1/campaigns").send({
        name: "Denied",
        campaignType: "MARKETING",
      });
      expect(response.status).toBe(403);
      expect(await prisma.campaign.count()).toBe(before);
    });

    it("denies list, read, and activities for a user without campaign permissions", async () => {
      expect((await as(plainUser, "get", "/api/v1/campaigns")).status).toBe(
        403,
      );

      const created = await createCampaign();
      for (const path of [
        `/api/v1/campaigns/${created.id}`,
        `/api/v1/campaigns/${created.id}/activities`,
      ]) {
        expect((await as(plainUser, "get", path)).status).toBe(403);
      }
      const activity = await as(
        plainUser,
        "post",
        `/api/v1/campaigns/${created.id}/activities`,
      ).send({ name: "Denied" });
      expect(activity.status).toBe(403);
    });

    it("lets Management/Administrator create and manage activities but not delete", async () => {
      const created = await createCampaign(management);
      const activity = await as(
        management,
        "post",
        `/api/v1/campaigns/${created.id}/activities`,
      ).send({ name: "Managed" });
      expect(activity.status).toBe(201);

      const deleted = await as(
        management,
        "delete",
        `/api/v1/campaigns/${created.id}`,
      );
      expect(deleted.status).toBe(403);
      expect(body<ProblemBody>(deleted).code).toBe("PERMISSION_DENIED");
    });
  });

  describe("create, read, and list", () => {
    it("creates a campaign with its workspace and returns only the public contract", async () => {
      const managerId = await createUser();
      const eventId = await createEvent();
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send({
        name: "Autumn Launch",
        campaignType: "PROMOTION",
        description: "  Awareness push.  ",
        audience: "  Young adults  ",
        startAt: "2026-10-01T18:00:00.000Z",
        endAt: "2026-11-01T18:00:00.000Z",
        eventId,
        managerId,
      });
      expect(response.status).toBe(201);
      const created = body<CampaignBody>(response);

      expect(created).toMatchObject({
        name: "Autumn Launch",
        campaignType: "PROMOTION",
        status: "PLANNED",
        description: "Awareness push.",
        audience: "Young adults",
        startAt: "2026-10-01T18:00:00.000Z",
        eventId,
        productName: null,
        progress: { completedActivities: 0, totalActivities: 0, percent: null },
        teams: [],
        participants: [],
      });
      expect(created.manager?.id).toBe(managerId);
      expect(created.createdBy?.email).toBe("super-admin@campaigns.test");
      expect(Object.keys(created).sort()).toEqual(CAMPAIGN_KEYS);

      const workspace = await prisma.workspace.findUnique({
        where: { id: created.workspaceId },
      });
      expect(workspace?.kind).toBe("CAMPAIGN");
      expect(workspace?.managerId).toBe(managerId);
    });

    it("creates a product-subject campaign", async () => {
      const created = await createCampaign(superAdmin, {
        productName: "Nexo Energy",
      });

      expect(created.productName).toBe("Nexo Energy");
      expect(created.eventId).toBeNull();
    });

    it("reads a campaign back by id", async () => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${created.id}`,
      );

      expect(response.status).toBe(200);
      expect(body<CampaignBody>(response)).toEqual(created);
    });

    it("404s an unknown manager on create and writes nothing", async () => {
      const campaigns = await prisma.campaign.count();
      const workspaces = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send({
        name: "Ghost Manager",
        campaignType: "MARKETING",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.campaign.count()).toBe(campaigns);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("404s an unknown related event on create and writes nothing", async () => {
      const workspaces = await prisma.workspace.count();
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send({
        name: "Ghost Event",
        campaignType: "MARKETING",
        eventId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("rejects an event and a product together", async () => {
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send({
        name: "Both",
        campaignType: "MARKETING",
        eventId: await createEvent(),
        productName: "Widget",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
      );
    });

    it("rejects an end before the start", async () => {
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send({
        name: "Backwards",
        campaignType: "MARKETING",
        startAt: "2026-10-02T00:00:00.000Z",
        endAt: "2026-10-01T00:00:00.000Z",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_SCHEDULE_INVALID",
      );
    });

    it.each([
      ["a missing name", { campaignType: "MARKETING" }],
      ["a blank name", { name: "   ", campaignType: "MARKETING" }],
      ["a missing type", { name: "No type" }],
      ["an unknown type", { name: "Bad", campaignType: "ADVERTISING" }],
      [
        "a blank audience",
        { name: "x", campaignType: "MARKETING", audience: " " },
      ],
      [
        "a malformed event id",
        { name: "x", campaignType: "MARKETING", eventId: "nope" },
      ],
      [
        "a non-ISO date",
        { name: "x", campaignType: "MARKETING", startAt: "soon" },
      ],
      [
        "an unexpected field",
        { name: "x", campaignType: "MARKETING", status: "ACTIVE" },
      ],
    ])("rejects %s", async (_label, payload) => {
      const response = await as(superAdmin, "post", "/api/v1/campaigns").send(
        payload,
      );
      expect(response.status).toBe(400);
    });

    it("lists with filters, paging, and a total", async () => {
      const eventId = await createEvent();
      const managerId = await createUser();
      const target = await createCampaign(superAdmin, {
        name: "list-target",
        campaignType: "PROMOTION",
        eventId,
        managerId,
      });
      await createCampaign(superAdmin, {
        name: "list-decoy",
        campaignType: "MARKETING",
      });
      await as(
        superAdmin,
        "post",
        `/api/v1/campaigns/${target.id}/transition`,
      ).send({ status: "ACTIVE" });

      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns?status=ACTIVE&campaignType=PROMOTION&eventId=${eventId}&managerId=${managerId}&search=LIST-TAR&page=1&pageSize=5`,
      );

      expect(response.status).toBe(200);
      const page = body<PageBody<CampaignBody>>(response);
      expect(page).toMatchObject({ page: 1, pageSize: 5, total: 1 });
      expect(page.items.map((item) => item.id)).toEqual([target.id]);
    });

    it.each([
      "status=BOGUS",
      "campaignType=BOGUS",
      "eventId=nope",
      "page=0",
      "pageSize=101",
      "startingAfter=soon",
    ])("rejects the invalid list query %s", async (query) => {
      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns?${query}`,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("update", () => {
    it("updates details and leaves untouched fields alone", async () => {
      const created = await createCampaign(superAdmin, {
        description: "Keep me",
        audience: "Clear me",
      });

      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${created.id}`,
      ).send({
        name: "  Renamed  ",
        audience: null,
        campaignType: "PROMOTION",
      });

      expect(response.status).toBe(200);
      expect(body<CampaignBody>(response)).toMatchObject({
        name: "Renamed",
        description: "Keep me",
        audience: null,
        campaignType: "PROMOTION",
      });
    });

    it("does not let a patch change status or budget", async () => {
      const created = await createCampaign();

      for (const payload of [
        { status: "ACTIVE" },
        { budgetAmount: 5 },
        { budget: { amount: 5, currency: "USD" } },
      ]) {
        const response = await as(
          superAdmin,
          "patch",
          `/api/v1/campaigns/${created.id}`,
        ).send(payload);
        expect(response.status).toBe(400);
      }
    });

    it("switches the related subject when the old one is cleared in the same request", async () => {
      const created = await createCampaign(superAdmin, {
        productName: "Widget",
      });
      const eventId = await createEvent();

      const conflict = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${created.id}`,
      ).send({ eventId });
      expect(conflict.status).toBe(400);
      expect(body<ProblemBody>(conflict).code).toBe(
        "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
      );

      const switched = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${created.id}`,
      ).send({ eventId, productName: null });
      expect(switched.status).toBe(200);
      expect(body<CampaignBody>(switched)).toMatchObject({
        eventId,
        productName: null,
      });
    });

    it("404s an unknown related event", async () => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${created.id}`,
      ).send({ eventId: UUID });

      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("EVENT_NOT_FOUND");
    });

    it("judges the schedule on the values after the patch", async () => {
      const created = await createCampaign(superAdmin, {
        startAt: "2026-10-05T00:00:00.000Z",
      });

      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${created.id}`,
      ).send({ endAt: "2026-10-01T00:00:00.000Z" });

      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_SCHEDULE_INVALID",
      );
    });
  });

  describe("lifecycle", () => {
    async function transition(id: string, status: string) {
      return as(superAdmin, "post", `/api/v1/campaigns/${id}/transition`).send({
        status,
      });
    }

    it("walks Planned -> Active -> Completed", async () => {
      const created = await createCampaign();

      const active = await transition(created.id, "ACTIVE");
      expect(active.status).toBe(200);
      expect(body<CampaignBody>(active).status).toBe("ACTIVE");

      const completed = await transition(created.id, "COMPLETED");
      expect(completed.status).toBe(200);
      expect(body<CampaignBody>(completed).status).toBe("COMPLETED");
    });

    it("cancels from Planned and from Active", async () => {
      const planned = await createCampaign();
      expect((await transition(planned.id, "CANCELLED")).status).toBe(200);

      const active = await createCampaign();
      await transition(active.id, "ACTIVE");
      expect((await transition(active.id, "CANCELLED")).status).toBe(200);
    });

    it("rejects a skipped or backwards move and a move out of a terminal state", async () => {
      const created = await createCampaign();

      const skipped = await transition(created.id, "COMPLETED");
      expect(skipped.status).toBe(409);
      expect(body<ProblemBody>(skipped).code).toBe(
        "CAMPAIGN_INVALID_TRANSITION",
      );

      await transition(created.id, "CANCELLED");
      const reopened = await transition(created.id, "ACTIVE");
      expect(reopened.status).toBe(409);
      expect(body<ProblemBody>(reopened).code).toBe(
        "CAMPAIGN_INVALID_TRANSITION",
      );
    });

    it("lets exactly one of two racing transitions win and never reopens a cancelled campaign", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const created = await createCampaign();

        const responses = await Promise.all([
          transition(created.id, "CANCELLED"),
          transition(created.id, "ACTIVE"),
        ]);

        const statuses = responses.map((response) => response.status).sort();
        expect(statuses).toEqual([200, 409]);
        const loser = responses.find((response) => response.status === 409);
        expect(body<ProblemBody>(loser!).code).toBe(
          "CAMPAIGN_INVALID_TRANSITION",
        );
        const winner = responses.find((response) => response.status === 200);
        const read = await as(
          superAdmin,
          "get",
          `/api/v1/campaigns/${created.id}`,
        );
        expect(body<CampaignBody>(read).status).toBe(
          body<CampaignBody>(winner!).status,
        );
      }
    });

    it("rejects an unknown status and a missing body", async () => {
      const created = await createCampaign();

      expect((await transition(created.id, "PAUSED")).status).toBe(400);
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/campaigns/${created.id}/transition`,
          ).send({})
        ).status,
      ).toBe(400);
    });
  });

  describe("manager and teams", () => {
    it("assigns, changes, and clears the manager", async () => {
      const created = await createCampaign();
      const managerId = await createUser();

      const assigned = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/manager`,
      ).send({ managerId });
      expect(assigned.status).toBe(200);
      expect(body<CampaignBody>(assigned).manager?.id).toBe(managerId);

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<CampaignBody>(cleared).manager).toBeNull();
    });

    it("404s an unknown manager and rejects a missing field", async () => {
      const created = await createCampaign();

      const ghost = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");

      expect(
        (
          await as(
            superAdmin,
            "put",
            `/api/v1/campaigns/${created.id}/manager`,
          ).send({})
        ).status,
      ).toBe(400);
    });

    it("assigns a team idempotently, then unassigns it", async () => {
      const created = await createCampaign();
      const teamId = await createTeam();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const assigned = await as(
          superAdmin,
          "put",
          `/api/v1/campaigns/${created.id}/teams/${teamId}`,
        );
        expect(assigned.status).toBe(200);
        expect(body<CampaignBody>(assigned).teams.map((t) => t.id)).toEqual([
          teamId,
        ]);
      }

      const unassigned = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${created.id}/teams/${teamId}`,
      );
      expect(unassigned.status).toBe(200);
      expect(body<CampaignBody>(unassigned).teams).toEqual([]);

      const again = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${created.id}/teams/${teamId}`,
      );
      expect(again.status).toBe(409);
      expect(body<ProblemBody>(again).code).toBe("CAMPAIGN_TEAM_NOT_ASSIGNED");
    });

    it("404s an unknown team", async () => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/teams/${UUID}`,
      );

      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("CAMPAIGN_TEAM_NOT_FOUND");
    });
  });

  describe("budget (sensitive)", () => {
    it("reads null before any budget is set", async () => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${created.id}/budget`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ amount: null, currency: null });
    });

    it("sets, reads back, and clears a budget", async () => {
      const created = await createCampaign();
      const path = `/api/v1/campaigns/${created.id}/budget`;

      const set = await as(management, "put", path).send({
        amount: 25000.5,
        currency: "ETB",
      });
      expect(set.status).toBe(200);
      expect(set.body).toEqual({ amount: "25000.50", currency: "ETB" });
      expect((await as(management, "get", path)).body).toEqual({
        amount: "25000.50",
        currency: "ETB",
      });

      const cleared = await as(management, "put", path).send({
        amount: null,
        currency: null,
      });
      expect(cleared.body).toEqual({ amount: null, currency: null });
    });

    it.each([
      ["an amount without a currency", { amount: 5, currency: null }],
      ["a currency without an amount", { amount: null, currency: "USD" }],
    ])("rejects %s", async (_label, payload) => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/budget`,
      ).send(payload);

      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_BUDGET_INCOMPLETE",
      );
    });

    it.each([
      ["a negative amount", { amount: -1, currency: "USD" }],
      ["three fraction digits", { amount: 1.234, currency: "USD" }],
      ["a lower-case currency", { amount: 1, currency: "usd" }],
      ["a four-letter currency", { amount: 1, currency: "USDX" }],
      ["a missing amount", { currency: "USD" }],
      ["a string amount", { amount: "1", currency: "USD" }],
    ])("rejects %s", async (_label, payload) => {
      const created = await createCampaign();

      const response = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/budget`,
      ).send(payload);

      expect(response.status).toBe(400);
    });

    it("denies budget access to a user without the budget keys", async () => {
      const created = await createCampaign();
      const path = `/api/v1/campaigns/${created.id}/budget`;

      expect((await as(plainUser, "get", path)).status).toBe(403);
      expect(
        (
          await as(plainUser, "put", path).send({
            amount: 1,
            currency: "USD",
          })
        ).status,
      ).toBe(403);
    });

    it("never exposes the budget through the campaign contract", async () => {
      const created = await createCampaign();
      await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${created.id}/budget`,
      ).send({ amount: 100, currency: "USD" });

      const single = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${created.id}`,
      );
      const list = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns?search=${encodeURIComponent(created.name)}`,
      );

      expect(Object.keys(single.body as object).sort()).toEqual(CAMPAIGN_KEYS);
      expect(JSON.stringify(list.body)).not.toContain("budget");
    });
  });

  describe("activities and progress", () => {
    it("creates, lists, updates, and deletes an activity", async () => {
      const campaign = await createCampaign();
      const base = `/api/v1/campaigns/${campaign.id}/activities`;

      const created = await createActivity(campaign.id, {
        name: "  Teaser  ",
        description: "  Post it.  ",
        startAt: "2026-10-01T00:00:00.000Z",
      });
      expect(created).toMatchObject({
        campaignId: campaign.id,
        name: "Teaser",
        description: "Post it.",
        status: "PLANNED",
        startAt: "2026-10-01T00:00:00.000Z",
        endAt: null,
      });
      expect(Object.keys(created).sort()).toEqual(ACTIVITY_KEYS);

      const listed = await as(superAdmin, "get", base);
      expect(listed.status).toBe(200);
      expect(body<PageBody<ActivityBody>>(listed)).toMatchObject({
        page: 1,
        pageSize: 25,
        total: 1,
      });

      const updated = await as(
        superAdmin,
        "patch",
        `${base}/${created.id}`,
      ).send({ name: "Teaser v2", description: null, status: "IN_PROGRESS" });
      expect(updated.status).toBe(200);
      expect(body<ActivityBody>(updated)).toMatchObject({
        name: "Teaser v2",
        description: null,
        status: "IN_PROGRESS",
      });

      const removed = await as(superAdmin, "delete", `${base}/${created.id}`);
      expect(removed.status).toBe(204);
      expect(
        body<PageBody<ActivityBody>>(await as(superAdmin, "get", base)).total,
      ).toBe(0);
    });

    it("reflects activity status changes in the campaign's progress", async () => {
      const campaign = await createCampaign();
      const first = await createActivity(campaign.id);
      await createActivity(campaign.id);
      const cancelled = await createActivity(campaign.id);

      await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${campaign.id}/activities/${first.id}`,
      ).send({ status: "COMPLETED" });
      await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${campaign.id}/activities/${cancelled.id}`,
      ).send({ status: "CANCELLED" });

      const read = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(body<CampaignBody>(read).progress).toEqual({
        completedActivities: 1,
        totalActivities: 2,
        percent: 50,
      });
    });

    it("filters and pages a campaign's activities", async () => {
      const campaign = await createCampaign();
      for (let index = 0; index < 3; index += 1) {
        await createActivity(campaign.id, { status: "COMPLETED" });
      }
      await createActivity(campaign.id);

      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}/activities?status=COMPLETED&page=2&pageSize=2`,
      );

      expect(response.status).toBe(200);
      const page = body<PageBody<ActivityBody>>(response);
      expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(page.items).toHaveLength(1);
    });

    it("rejects an activity end before its start", async () => {
      const campaign = await createCampaign();

      const response = await as(
        superAdmin,
        "post",
        `/api/v1/campaigns/${campaign.id}/activities`,
      ).send({
        name: "Backwards",
        startAt: "2026-10-02T00:00:00.000Z",
        endAt: "2026-10-01T00:00:00.000Z",
      });

      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_ACTIVITY_SCHEDULE_INVALID",
      );
    });

    it.each([
      ["a missing name", {}],
      ["a blank name", { name: "  " }],
      ["an unknown status", { name: "x", status: "ACTIVE" }],
      ["a non-ISO date", { name: "x", endAt: "later" }],
      ["an unexpected field", { name: "x", campaignId: UUID }],
    ])("rejects an activity with %s", async (_label, payload) => {
      const campaign = await createCampaign();

      const response = await as(
        superAdmin,
        "post",
        `/api/v1/campaigns/${campaign.id}/activities`,
      ).send(payload);

      expect(response.status).toBe(400);
    });

    it("404s an activity that belongs to a different campaign", async () => {
      const owner = await createCampaign();
      const other = await createCampaign();
      const activity = await createActivity(owner.id);

      const patch = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${other.id}/activities/${activity.id}`,
      ).send({ name: "Hijack" });
      expect(patch.status).toBe(404);
      expect(body<ProblemBody>(patch).code).toBe("CAMPAIGN_ACTIVITY_NOT_FOUND");

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${other.id}/activities/${activity.id}`,
      );
      expect(removed.status).toBe(404);
    });

    it("404s activities under an unknown campaign", async () => {
      const list = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${UUID}/activities`,
      );
      expect(list.status).toBe(404);
      expect(body<ProblemBody>(list).code).toBe("CAMPAIGN_NOT_FOUND");

      const create = await as(
        superAdmin,
        "post",
        `/api/v1/campaigns/${UUID}/activities`,
      ).send({ name: "x" });
      expect(create.status).toBe(404);
    });
  });

  describe("delete", () => {
    it("removes the campaign, its activities, and its workspace", async () => {
      const campaign = await createCampaign();
      await createActivity(campaign.id);

      const response = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${campaign.id}`,
      );

      expect(response.status).toBe(204);
      expect(
        (await as(superAdmin, "get", `/api/v1/campaigns/${campaign.id}`))
          .status,
      ).toBe(404);
      expect(
        await prisma.workspace.findUnique({
          where: { id: campaign.workspaceId },
        }),
      ).toBeNull();
      expect(
        await prisma.campaignActivity.count({
          where: { campaignId: campaign.id },
        }),
      ).toBe(0);
    });

    it("409s when the campaign workspace has an attached managed file", async () => {
      const campaign = await createCampaign();
      await prisma.$transaction(async (tx) => {
        const managedFile = await tx.managedFile.create({
          data: {
            storageKey: `attached-${campaign.id}`,
            originalFilename: "brief.pdf",
            declaredMediaType: "application/pdf",
            declaredSizeBytes: 2048,
            state: "AVAILABLE",
            intentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
            uploadedAt: new Date("2026-06-01T00:00:00.000Z"),
            availableAt: new Date("2026-06-01T00:00:01.000Z"),
            verifiedMediaType: "application/pdf",
            verifiedSizeBytes: 2048,
          },
        });
        await tx.workspaceFileAttachment.create({
          data: {
            workspaceId: campaign.workspaceId,
            managedFileId: managedFile.id,
          },
        });
      });

      const response = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${campaign.id}`,
      );

      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_HAS_MANAGED_FILES",
      );
      expect(
        (await as(superAdmin, "get", `/api/v1/campaigns/${campaign.id}`))
          .status,
      ).toBe(200);
    });
  });

  describe("unknown and malformed ids", () => {
    it.each([
      ["get", "/api/v1/campaigns/NOT_A_UUID"],
      ["get", "/api/v1/campaigns/NOT_A_UUID/budget"],
      ["get", "/api/v1/campaigns/NOT_A_UUID/activities"],
      ["delete", "/api/v1/campaigns/NOT_A_UUID"],
      ["get", `/api/v1/campaigns/${UUID}`],
      ["get", `/api/v1/campaigns/${UUID}/budget`],
      ["delete", `/api/v1/campaigns/${UUID}`],
    ] as const)("404s %s %s", async (method, path) => {
      const response = await as(superAdmin, method, path);

      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("CAMPAIGN_NOT_FOUND");
    });

    it("404s a malformed id on every write route", async () => {
      const writes: [
        "post" | "put" | "patch" | "delete",
        string,
        Record<string, unknown>?,
      ][] = [
        ["patch", "/api/v1/campaigns/NOT_A_UUID", { name: "x" }],
        [
          "post",
          "/api/v1/campaigns/NOT_A_UUID/transition",
          { status: "ACTIVE" },
        ],
        ["put", "/api/v1/campaigns/NOT_A_UUID/manager", { managerId: null }],
        ["put", `/api/v1/campaigns/NOT_A_UUID/teams/${UUID}`],
        ["delete", `/api/v1/campaigns/NOT_A_UUID/teams/${UUID}`],
        [
          "put",
          "/api/v1/campaigns/NOT_A_UUID/budget",
          { amount: null, currency: null },
        ],
        ["post", "/api/v1/campaigns/NOT_A_UUID/activities", { name: "x" }],
      ];
      for (const [method, path, payload] of writes) {
        const response = await as(superAdmin, method, path).send(payload ?? {});
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    });

    it("404s a malformed activity id under a real campaign", async () => {
      const campaign = await createCampaign();

      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${campaign.id}/activities/NOT_A_UUID`,
      ).send({ name: "x" });

      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe(
        "CAMPAIGN_ACTIVITY_NOT_FOUND",
      );
    });
  });

  describe("every route enforces authentication and CSRF", () => {
    const CAMPAIGN_ID = UUID;
    const routes: [
      "get" | "post" | "put" | "patch" | "delete",
      string,
      Record<string, unknown>?,
    ][] = [
      ["get", "/api/v1/campaigns"],
      ["post", "/api/v1/campaigns", { name: "x", campaignType: "MARKETING" }],
      ["get", `/api/v1/campaigns/${CAMPAIGN_ID}`],
      ["patch", `/api/v1/campaigns/${CAMPAIGN_ID}`, { name: "x" }],
      ["delete", `/api/v1/campaigns/${CAMPAIGN_ID}`],
      [
        "post",
        `/api/v1/campaigns/${CAMPAIGN_ID}/transition`,
        { status: "ACTIVE" },
      ],
      ["put", `/api/v1/campaigns/${CAMPAIGN_ID}/manager`, { managerId: null }],
      ["put", `/api/v1/campaigns/${CAMPAIGN_ID}/teams/${UUID}`],
      ["delete", `/api/v1/campaigns/${CAMPAIGN_ID}/teams/${UUID}`],
      ["get", `/api/v1/campaigns/${CAMPAIGN_ID}/budget`],
      [
        "put",
        `/api/v1/campaigns/${CAMPAIGN_ID}/budget`,
        { amount: null, currency: null },
      ],
      ["get", `/api/v1/campaigns/${CAMPAIGN_ID}/activities`],
      ["post", `/api/v1/campaigns/${CAMPAIGN_ID}/activities`, { name: "x" }],
      [
        "patch",
        `/api/v1/campaigns/${CAMPAIGN_ID}/activities/${UUID}`,
        { name: "x" },
      ],
      ["delete", `/api/v1/campaigns/${CAMPAIGN_ID}/activities/${UUID}`],
    ];

    it.each(routes)("401s an unauthenticated %s %s", async (method, path) => {
      const response = await request(http)[method](path).send({});
      expect(response.status).toBe(401);
    });

    it.each(routes.filter(([method]) => method !== "get"))(
      "403s %s %s without a CSRF token",
      async (method, path, payload) => {
        const withoutCsrf = request(http)[method](path);
        const response = await withoutCsrf
          .set("Cookie", superAdmin.cookies)
          .send(payload ?? {});
        expect(response.status).toBe(403);
      },
    );

    it.each(routes)(
      "403s %s %s for a user with no campaign permissions",
      async (method, path, payload) => {
        const response = await as(plainUser, method, path).send(payload ?? {});
        expect(response.status).toBe(403);
        expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      },
    );
  });

  describe("a read-only role", () => {
    it("reads campaigns and activities but cannot write, transition, assign, or see the budget", async () => {
      const campaign = await createCampaign();
      const activity = await createActivity(campaign.id);
      const teamId = await createTeam();

      const reads = [
        "/api/v1/campaigns",
        `/api/v1/campaigns/${campaign.id}`,
        `/api/v1/campaigns/${campaign.id}/activities`,
      ];
      for (const path of reads) {
        expect((await as(readOnly, "get", path)).status, path).toBe(200);
      }

      const writes: [
        "post" | "put" | "patch" | "delete",
        string,
        Record<string, unknown>?,
      ][] = [
        ["post", "/api/v1/campaigns", { name: "x", campaignType: "MARKETING" }],
        ["patch", `/api/v1/campaigns/${campaign.id}`, { name: "x" }],
        [
          "post",
          `/api/v1/campaigns/${campaign.id}/transition`,
          { status: "ACTIVE" },
        ],
        [
          "put",
          `/api/v1/campaigns/${campaign.id}/manager`,
          { managerId: null },
        ],
        ["put", `/api/v1/campaigns/${campaign.id}/teams/${teamId}`],
        ["delete", `/api/v1/campaigns/${campaign.id}/teams/${teamId}`],
        ["post", `/api/v1/campaigns/${campaign.id}/activities`, { name: "x" }],
        [
          "patch",
          `/api/v1/campaigns/${campaign.id}/activities/${activity.id}`,
          { name: "x" },
        ],
        [
          "delete",
          `/api/v1/campaigns/${campaign.id}/activities/${activity.id}`,
        ],
        ["delete", `/api/v1/campaigns/${campaign.id}`],
      ];
      for (const [method, path, payload] of writes) {
        const response = await as(readOnly, method, path).send(payload ?? {});
        expect(response.status, `${method} ${path}`).toBe(403);
      }

      const budgetPath = `/api/v1/campaigns/${campaign.id}/budget`;
      expect((await as(readOnly, "get", budgetPath)).status).toBe(403);
      expect(
        (
          await as(readOnly, "put", budgetPath).send({
            amount: 1,
            currency: "USD",
          })
        ).status,
      ).toBe(403);

      // Nothing the denied writes attempted took effect.
      const after = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(body<CampaignBody>(after)).toMatchObject({
        name: campaign.name,
        status: "PLANNED",
        teams: [],
      });
    });
  });

  describe("transport contract", () => {
    it("returns a full Problem Details body and echoes x-request-id", async () => {
      const response = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${UUID}`,
      ).set("x-request-id", "campaigns-error-id");

      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.headers["x-request-id"]).toBe("campaigns-error-id");
      const problem = response.body as Record<string, unknown>;
      expect(problem).toMatchObject({
        code: "CAMPAIGN_NOT_FOUND",
        status: 404,
        title: "Not Found",
        instance: `/api/v1/campaigns/${UUID}`,
      });
      expect(typeof problem.type).toBe("string");
      expect(typeof problem.detail).toBe("string");
      expect(typeof problem.requestId).toBe("string");
    });

    it("keeps the same shape for validation, conflict, and permission errors", async () => {
      const campaign = await createCampaign();
      const cases: [request.Response, number, string][] = [
        [
          await as(superAdmin, "post", "/api/v1/campaigns").send({
            campaignType: "MARKETING",
          }),
          400,
          "Validation Failed",
        ],
        [
          await as(
            superAdmin,
            "post",
            `/api/v1/campaigns/${campaign.id}/transition`,
          ).send({ status: "COMPLETED" }),
          409,
          "Conflict",
        ],
        [await as(plainUser, "get", "/api/v1/campaigns"), 403, "Forbidden"],
      ];

      for (const [response, status, title] of cases) {
        expect(response.status).toBe(status);
        expect(response.headers["content-type"]).toContain(
          "application/problem+json",
        );
        expect(response.body).toMatchObject({ status, title });
        expect(typeof (response.body as ProblemBody).code).toBe("string");
      }
    });

    it("echoes x-request-id on a successful mutation", async () => {
      const campaign = await createCampaign();

      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      )
        .set("x-request-id", "campaigns-mutation-id")
        .send({ name: "Echo" });

      expect(response.headers["x-request-id"]).toBe("campaigns-mutation-id");
    });

    it("never leaks a stack trace or database detail", async () => {
      const responses = [
        await as(superAdmin, "get", "/api/v1/campaigns/NOT_A_UUID"),
        await as(superAdmin, "post", "/api/v1/campaigns").send({
          name: "x",
          campaignType: "MARKETING",
          managerId: UUID,
        }),
        await as(
          superAdmin,
          "put",
          `/api/v1/campaigns/${UUID}/teams/NOT_A_UUID`,
        ),
      ];

      for (const response of responses) {
        const text = JSON.stringify(response.body);
        expect(text).not.toMatch(
          /prisma|postgres|SQLSTATE|violates|at \S+\.ts/i,
        );
      }
    });
  });

  describe("teams and assignments", () => {
    it("treats a non-uuid :teamId as not-found on assign and not-assigned on unassign", async () => {
      const campaign = await createCampaign();

      const assign = await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${campaign.id}/teams/not-a-uuid`,
      );
      expect(assign.status).toBe(404);
      expect(body<ProblemBody>(assign).code).toBe("CAMPAIGN_TEAM_NOT_FOUND");

      const unassign = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${campaign.id}/teams/not-a-uuid`,
      );
      expect(unassign.status).toBe(409);
      expect(body<ProblemBody>(unassign).code).toBe(
        "CAMPAIGN_TEAM_NOT_ASSIGNED",
      );
    });

    it("keeps several teams sorted by name and unassigns only the one named", async () => {
      const campaign = await createCampaign();
      const first = await createTeam();
      const second = await createTeam();
      for (const teamId of [first, second]) {
        await as(
          superAdmin,
          "put",
          `/api/v1/campaigns/${campaign.id}/teams/${teamId}`,
        );
      }

      const after = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${campaign.id}/teams/${first}`,
      );

      expect(body<CampaignBody>(after).teams.map((team) => team.id)).toEqual([
        second,
      ]);
    });

    it("repeating the manager assignment is idempotent", async () => {
      const campaign = await createCampaign();
      const managerId = await createUser();
      const path = `/api/v1/campaigns/${campaign.id}/manager`;

      const first = await as(superAdmin, "put", path).send({ managerId });
      const second = await as(superAdmin, "put", path).send({ managerId });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(body<CampaignBody>(second).manager?.id).toBe(managerId);
    });

    it("shares its people with the generic workspace routes", async () => {
      const campaign = await createCampaign();
      const teamId = await createTeam();
      const participantId = await createUser();
      await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${campaign.id}/teams/${teamId}`,
      );

      const participant = await as(
        superAdmin,
        "put",
        `/api/v1/workspaces/${campaign.workspaceId}/participants/${participantId}`,
      );
      expect(participant.status).toBe(200);

      const viaCampaign = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      const viaWorkspace = await as(
        superAdmin,
        "get",
        `/api/v1/workspaces/${campaign.workspaceId}`,
      );
      expect(
        body<CampaignBody>(viaCampaign).participants.map((p) => p.id),
      ).toEqual([participantId]);
      expect(
        (
          viaWorkspace.body as {
            kind: string;
            teams: { id: string }[];
          }
        ).teams.map((team) => team.id),
      ).toEqual([teamId]);
      expect((viaWorkspace.body as { kind: string }).kind).toBe("CAMPAIGN");
    });

    it("guards the campaign workspace with the campaign keys on the generic routes", async () => {
      const campaign = await createCampaign();

      const denied = await as(
        plainUser,
        "get",
        `/api/v1/workspaces/${campaign.workspaceId}`,
      );
      const readOnlyRead = await as(
        readOnly,
        "get",
        `/api/v1/workspaces/${campaign.workspaceId}`,
      );
      const readOnlyWrite = await as(
        readOnly,
        "put",
        `/api/v1/workspaces/${campaign.workspaceId}/manager`,
      ).send({ managerId: null });

      expect(denied.status).toBe(403);
      expect(readOnlyRead.status).toBe(200);
      expect(readOnlyWrite.status).toBe(403);
    });
  });

  describe("deletion side effects", () => {
    it("spares the team, users, and related event, dropping only the assignments", async () => {
      const eventId = await createEvent();
      const teamId = await createTeam();
      const managerId = await createUser();
      const campaign = await createCampaign(superAdmin, {
        eventId,
        managerId,
      });
      await as(
        superAdmin,
        "put",
        `/api/v1/campaigns/${campaign.id}/teams/${teamId}`,
      );

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${campaign.id}`,
      );

      expect(removed.status).toBe(204);
      expect(
        await prisma.event.findUnique({ where: { id: eventId } }),
      ).not.toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: managerId } }),
      ).not.toBeNull();
      expect(
        await prisma.workspaceTeam.count({
          where: { workspaceId: campaign.workspaceId },
        }),
      ).toBe(0);
    });

    it("keeps the campaign when its related event is deleted first", async () => {
      const eventId = await createEvent();
      const campaign = await createCampaign(superAdmin, { eventId });

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${eventId}`,
      );
      expect(removed.status).toBe(204);

      const read = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(read.status).toBe(200);
      expect(body<CampaignBody>(read).eventId).toBeNull();
    });

    it("keeps the campaign, with no author, when its author is deleted", async () => {
      const author = await prisma.user.create({
        data: { email: "temp-author@campaigns.test" },
      });
      const workspace = await prisma.workspace.create({
        data: { kind: "CAMPAIGN" },
      });
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: workspace.id,
          name: "Authored elsewhere",
          campaignType: "MARKETING",
          createdById: author.id,
        },
      });
      const before = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(body<CampaignBody>(before).createdBy?.id).toBe(author.id);

      await prisma.user.delete({ where: { id: author.id } });

      const after = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(after.status).toBe(200);
      expect(body<CampaignBody>(after).createdBy).toBeNull();
    });
  });

  describe("budget boundaries", () => {
    it("accepts the numeric(14,2) ceiling and zero, and rejects anything above", async () => {
      const campaign = await createCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/budget`;

      const ceiling = await as(superAdmin, "put", path).send({
        amount: 999999999999.99,
        currency: "USD",
      });
      expect(ceiling.status).toBe(200);
      expect(ceiling.body).toEqual({
        amount: "999999999999.99",
        currency: "USD",
      });

      const zero = await as(superAdmin, "put", path).send({
        amount: 0,
        currency: "USD",
      });
      expect(zero.body).toEqual({ amount: "0.00", currency: "USD" });

      const over = await as(superAdmin, "put", path).send({
        amount: 1000000000000,
        currency: "USD",
      });
      expect(over.status).toBe(400);
      // A rejected update leaves the previous budget intact.
      expect((await as(superAdmin, "get", path)).body).toEqual({
        amount: "0.00",
        currency: "USD",
      });
    });
  });

  describe("concurrent requests stay consistent", () => {
    it("creates distinct campaigns and workspaces in parallel", async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => createCampaign()),
      );

      expect(new Set(results.map((item) => item.id)).size).toBe(8);
      expect(new Set(results.map((item) => item.workspaceId)).size).toBe(8);
    });

    it("assigns the same team in parallel without duplicating it", async () => {
      const campaign = await createCampaign();
      const teamId = await createTeam();

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          as(
            superAdmin,
            "put",
            `/api/v1/campaigns/${campaign.id}/teams/${teamId}`,
          ),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200, 200,
      ]);
      expect(
        await prisma.workspaceTeam.count({
          where: { workspaceId: campaign.workspaceId },
        }),
      ).toBe(1);
    });

    it("counts every parallel activity toward progress", async () => {
      const campaign = await createCampaign();

      await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          createActivity(campaign.id, {
            status: index < 3 ? "COMPLETED" : "PLANNED",
          }),
        ),
      );

      const read = await as(
        superAdmin,
        "get",
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(body<CampaignBody>(read).progress).toEqual({
        completedActivities: 3,
        totalActivities: 6,
        percent: 50,
      });
    });

    it("lets exactly one of two parallel deletes succeed", async () => {
      const campaign = await createCampaign();

      const responses = await Promise.all([
        as(superAdmin, "delete", `/api/v1/campaigns/${campaign.id}`),
        as(superAdmin, "delete", `/api/v1/campaigns/${campaign.id}`),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        204, 404,
      ]);
    });
  });
});
