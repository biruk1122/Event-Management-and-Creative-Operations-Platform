import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * EVE-234: the Promotion workspace's read-only event schedule and overview,
 * and campaign completion reports reviewed by the Marketing Manager through
 * the existing report workflow. Event changes stay with the event's own
 * department.
 */
const PASSWORD = "correct horse battery staple";

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface ProblemBody {
  code: string;
}
interface EventSummary {
  id: string;
  name: string;
  startAt: string;
  location: string | null;
  departmentName: string | null;
  campaigns: { id: string; name: string; status: string }[];
}
interface EventPage {
  items: EventSummary[];
  total: number;
}
interface Overview {
  totalCampaigns: number;
  campaignsByStatus: { status: string; count: number }[];
  upcomingEventCount: number;
  nextEvents: EventSummary[];
  partnershipsByStatus: { status: string; count: number }[] | null;
  budget:
    | {
        currency: string;
        allocated: string;
        approved: string;
        pending: string;
        campaignCount: number;
      }[]
    | null;
  performance: { key: string; value: string; campaignCount: number }[];
}
interface Report {
  id: string;
  type: string;
  status: string;
  reportToId: string | null;
  workspaceIds: string[];
  reviews: { outcome: string; note: string | null }[];
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("promotion workspace summaries and completion reports (EVE-234)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let promotionId: string;
  let marketingId: string;
  let eventOfficeId: string;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let marketingManager: Principal;
  let marketingMember: Principal;
  let eventOfficeManager: Principal;
  let superAdmin: Principal;
  let sequence = 0;
  const day = 86_400_000;

  beforeAll(async () => {
    // Keep migration data: departments and the Promotion -> Marketing link.
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "promotion-workspace-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "promotion-workspace-refresh-token-secret-at-least-32";
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);
    const [{ Test }, { AppModule }, { configureApplication }] =
      await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module.js"),
        import("../src/app.setup.js"),
      ]);
    const department = async (name: string) =>
      (await prisma.department.findUniqueOrThrow({ where: { name } })).id;
    promotionId = await department("Promotion");
    marketingId = await department("Marketing");
    eventOfficeId = await department("Manager / Event & Office Manager");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();

    promotionManager = await principal("Department Manager", promotionId);
    promotionMember = await principal("Department Member", promotionId);
    marketingManager = await principal("Department Manager", marketingId);
    marketingMember = await principal("Department Member", marketingId);
    eventOfficeManager = await principal("Department Manager", eventOfficeId);
    superAdmin = await principal("Super Admin", null);
    for (const [id, managerId] of [
      [promotionId, promotionManager.id],
      [marketingId, marketingManager.id],
      [eventOfficeId, eventOfficeManager.id],
    ] as const) {
      await prisma.department.update({ where: { id }, data: { managerId } });
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function principal(
    roleName: string,
    departmentId: string | null,
  ): Promise<Principal> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const email = `promo-ws-${++sequence}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: roleName.split(" ")[0] ?? "User",
        lastName: `${sequence}`,
        ...(departmentId ? { departmentId } : {}),
        credential: {
          create: { passwordHash: await new PasswordHasher().hash(PASSWORD) },
        },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    const csrf = cookies
      .find((cookie) => cookie.startsWith("csrf_token="))!
      .split(";")[0]!
      .split("=")[1]!;
    return { id: user.id, cookies, csrf };
  }

  function as(
    who: Principal,
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
  ) {
    const agent = request(app.getHttpServer());
    const call = agent[method](path).set("Cookie", who.cookies);
    return method === "get" ? call : call.set("x-csrf-token", who.csrf);
  }

  async function event(input: {
    name: string;
    startInDays: number;
    status?: "PLANNING" | "READY" | "CANCELLED" | "COMPLETED";
    departmentId?: string;
  }) {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    return prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name: input.name,
        eventType: "CONCERT",
        startAt: new Date(Date.now() + input.startInDays * day),
        location: "Millennium Hall",
        status: input.status ?? "PLANNING",
        departmentId: input.departmentId ?? eventOfficeId,
      },
    });
  }

  async function campaign(input: {
    departmentId: string;
    campaignType?: "PROMOTION" | "MARKETING";
    status?: "PLANNED" | "ACTIVE" | "COMPLETED";
    eventId?: string;
  }) {
    const workspace = await prisma.workspace.create({
      data: { kind: "CAMPAIGN" },
    });
    return prisma.campaign.create({
      data: {
        name: `Campaign ${++sequence}`,
        campaignType: input.campaignType ?? "PROMOTION",
        departmentId: input.departmentId,
        workspaceId: workspace.id,
        status: input.status ?? "ACTIVE",
        ...(input.eventId ? { eventId: input.eventId } : {}),
      },
    });
  }

  describe("upcoming events", () => {
    it("lists upcoming events organization-wide with the readable promotion campaigns", async () => {
      const launch = await event({ name: "Launch night", startInDays: 3 });
      const later = await event({ name: "Album tour", startInDays: 9 });
      await event({ name: "Called off", startInDays: 4, status: "CANCELLED" });
      await event({ name: "Already held", startInDays: -5 });
      const promo = await campaign({
        departmentId: promotionId,
        eventId: launch.id,
      });
      // A Marketing campaign on the same event is not a promotion link.
      await campaign({
        departmentId: marketingId,
        campaignType: "MARKETING",
        eventId: launch.id,
      });

      const response = await as(
        promotionManager,
        "get",
        "/api/v1/promotion/events/upcoming?pageSize=100",
      );
      expect(response.status).toBe(200);
      const page = body<EventPage>(response);
      const names = page.items.map((item) => item.name);
      expect(names).toContain("Launch night");
      expect(names).toContain("Album tour");
      expect(names).not.toContain("Called off");
      expect(names).not.toContain("Already held");
      expect(names.indexOf("Launch night")).toBeLessThan(
        names.indexOf("Album tour"),
      );
      const summary = page.items.find((item) => item.id === launch.id)!;
      expect(summary).toMatchObject({
        location: "Millennium Hall",
        departmentName: "Manager / Event & Office Manager",
        campaigns: [{ id: promo.id, name: promo.name, status: "ACTIVE" }],
      });
      expect(
        page.items.find((item) => item.id === later.id)!.campaigns,
      ).toEqual([]);
    });

    it("is read by the Promotion manager and the overseeing Marketing Manager, not other staff", async () => {
      await event({ name: "Members night", startInDays: 2 });
      for (const who of [promotionManager, marketingManager, superAdmin]) {
        const response = await as(
          who,
          "get",
          "/api/v1/promotion/events/upcoming",
        );
        expect(response.status).toBe(200);
      }
      // Team members hold no `campaign.read` (existing RBAC), so the guard
      // refuses them like any other department.
      for (const who of [
        promotionMember,
        marketingMember,
        eventOfficeManager,
      ]) {
        const response = await as(
          who,
          "get",
          "/api/v1/promotion/events/upcoming",
        );
        expect(response.status).toBe(403);
      }
    });

    it("keeps event changes with the event's own department", async () => {
      const owned = await event({ name: "Owned elsewhere", startInDays: 6 });
      const edit = await as(
        promotionManager,
        "patch",
        `/api/v1/events/${owned.id}`,
      ).send({ name: "Renamed by Promotion" });
      expect(edit.status).toBe(403);
      const unchanged = await prisma.event.findUniqueOrThrow({
        where: { id: owned.id },
      });
      expect(unchanged.name).toBe("Owned elsewhere");
    });

    it("validates the window", async () => {
      const response = await as(
        promotionManager,
        "get",
        "/api/v1/promotion/events/upcoming?from=not-a-date",
      );
      expect(response.status).toBe(400);
    });
  });

  describe("overview", () => {
    it("counts readable promotion campaigns, budget, partnerships and the latest indicators", async () => {
      const active = await campaign({ departmentId: promotionId });
      const done = await campaign({
        departmentId: promotionId,
        status: "COMPLETED",
      });
      // Marketing's own campaign never appears in the Promotion overview.
      await campaign({ departmentId: marketingId, campaignType: "MARKETING" });
      const budget = await as(
        promotionManager,
        "put",
        `/api/v1/campaigns/${active.id}/budget`,
      ).send({ amount: 5000, currency: "ETB" });
      expect(budget.status).toBe(200);
      await prisma.campaignMetric.createMany({
        data: [
          {
            campaignId: active.id,
            key: "REACH",
            value: 100,
            recordedOn: new Date("2026-10-01"),
          },
          {
            campaignId: active.id,
            key: "REACH",
            value: 400,
            recordedOn: new Date("2026-10-08"),
          },
          {
            campaignId: done.id,
            key: "REACH",
            value: 250.5,
            recordedOn: new Date("2026-10-02"),
          },
        ],
      });
      await prisma.partner.create({
        data: {
          organizationName: "Sound FM",
          category: "Media",
          departmentId: promotionId,
          status: "COMMITTED",
        },
      });

      const response = await as(
        promotionManager,
        "get",
        "/api/v1/promotion/overview",
      );
      expect(response.status).toBe(200);
      const overview = body<Overview>(response);
      const promotionCampaigns = await prisma.campaign.count({
        where: { campaignType: "PROMOTION", archivedAt: null },
      });
      expect(overview.totalCampaigns).toBe(promotionCampaigns);
      expect(
        overview.campaignsByStatus.find((row) => row.status === "COMPLETED")
          ?.count,
      ).toBeGreaterThanOrEqual(1);
      expect(overview.budget).toContainEqual(
        expect.objectContaining({ currency: "ETB", allocated: "5000.00" }),
      );
      expect(overview.partnershipsByStatus).toContainEqual({
        status: "COMMITTED",
        count: 1,
      });
      // The newest REACH of each campaign: 400 + 250.50.
      expect(overview.performance).toContainEqual({
        key: "REACH",
        value: "650.50",
        campaignCount: 2,
      });
      expect(overview.upcomingEventCount).toBeGreaterThanOrEqual(
        overview.nextEvents.length,
      );
    });

    it("gives the overseeing manager the same read and refuses other departments", async () => {
      const oversight = await as(
        marketingManager,
        "get",
        "/api/v1/promotion/overview",
      );
      expect(oversight.status).toBe(200);
      const own = await as(
        promotionManager,
        "get",
        "/api/v1/promotion/overview",
      );
      expect(body<Overview>(oversight).totalCampaigns).toBe(
        body<Overview>(own).totalCampaigns,
      );
      const refused = await as(
        marketingMember,
        "get",
        "/api/v1/promotion/overview",
      );
      expect(refused.status).toBe(403);
    });
  });

  describe("campaign completion reports", () => {
    // Reports are unique per author, type and start date (existing rule), so
    // each draft starts on its own day.
    let startDay = 0;
    async function draft(
      who: Principal,
      payload: Record<string, unknown> = {},
    ) {
      const c = await campaign({
        departmentId: promotionId,
        status: "COMPLETED",
      });
      const response = await as(who, "post", "/api/v1/reports").send({
        type: "CAMPAIGN_COMPLETION",
        title: `${c.name} completion`,
        periodStart: `2026-08-${String(++startDay).padStart(2, "0")}`,
        periodEnd: "2026-10-31",
        workspaceIds: [c.workspaceId],
        majorAchievements: "Reached 40,000 listeners; sold out launch night.",
        challenges: "Late poster delivery.",
        lessonsLearned: "Book radio slots two weeks earlier.",
        recommendations: "Repeat the street team in Bole.",
        ...payload,
      });
      return { campaign: c, response };
    }

    it("records outcomes linked to the campaign and goes to the Marketing Manager for review", async () => {
      const { campaign: c, response } = await draft(promotionManager);
      expect(response.status).toBe(201);
      const created = body<Report>(response);
      expect(created).toMatchObject({
        type: "CAMPAIGN_COMPLETION",
        status: "DRAFT",
        workspaceIds: [c.workspaceId],
      });

      const submitted = await as(
        promotionManager,
        "post",
        `/api/v1/reports/${created.id}/submit`,
      ).send({});
      expect(submitted.status).toBe(200);
      expect(body<Report>(submitted)).toMatchObject({
        status: "SUBMITTED",
        reportToId: marketingManager.id,
      });

      const changes = await as(
        marketingManager,
        "post",
        `/api/v1/reports/${created.id}/reviews`,
      ).send({ outcome: "CHANGES_REQUESTED", note: "Add the ticket count." });
      expect(changes.status).toBe(200);

      const revised = await as(
        promotionManager,
        "patch",
        `/api/v1/reports/${created.id}`,
      ).send({ majorAchievements: "Reached 40,000 listeners; 1,200 tickets." });
      expect(revised.status).toBe(200);
      const resubmitted = await as(
        promotionManager,
        "post",
        `/api/v1/reports/${created.id}/submit`,
      ).send({});
      expect(resubmitted.status).toBe(200);
      const reviewed = await as(
        marketingManager,
        "post",
        `/api/v1/reports/${created.id}/reviews`,
      ).send({ outcome: "REVIEWED" });
      expect(reviewed.status).toBe(200);

      const history = await as(
        promotionManager,
        "get",
        `/api/v1/reports/${created.id}`,
      );
      expect(history.status).toBe(200);
      const final = body<Report>(history);
      expect(final.status).toBe("REVIEWED");
      expect(final.reviews.map((review) => review.outcome)).toEqual(
        expect.arrayContaining(["CHANGES_REQUESTED", "REVIEWED"]),
      );
      expect(final.reviews).toHaveLength(2);
    });

    it("refuses review by anyone but the recipient", async () => {
      const { response } = await draft(promotionManager);
      const id = body<Report>(response).id;
      expect(
        (
          await as(
            promotionManager,
            "post",
            `/api/v1/reports/${id}/submit`,
          ).send({})
        ).status,
      ).toBe(200);
      const self = await as(
        promotionManager,
        "post",
        `/api/v1/reports/${id}/reviews`,
      ).send({ outcome: "REVIEWED" });
      expect(self.status).toBe(403);
      const member = await as(
        marketingMember,
        "post",
        `/api/v1/reports/${id}/reviews`,
      ).send({ outcome: "REVIEWED" });
      expect(member.status).toBe(403);
    });

    it("requires exactly one campaign and a period that does not end before it starts", async () => {
      const none = await draft(promotionManager, { workspaceIds: [] });
      expect(none.response.status).toBe(400);
      expect(body<ProblemBody>(none.response).code).toBe(
        "REPORT_CAMPAIGN_REQUIRED",
      );
      const project = await prisma.workspace.create({
        data: { kind: "PROJECT" },
      });
      const notCampaign = await draft(superAdmin, {
        workspaceIds: [project.id],
        departmentId: promotionId,
      });
      expect(notCampaign.response.status).toBe(400);
      expect(body<ProblemBody>(notCampaign.response).code).toBe(
        "REPORT_CAMPAIGN_REQUIRED",
      );
      const backwards = await draft(promotionManager, {
        periodStart: "2026-10-31",
        periodEnd: "2026-10-01",
      });
      expect(backwards.response.status).toBe(400);
    });

    it("refuses the sections that belong to periodic reports", async () => {
      const { response } = await draft(promotionManager, {
        nextDayPlan: "Not a completion section.",
      });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("REPORT_INVALID_SECTIONS");
    });

    it("keeps the Marketing Manager from filing Promotion's reports", async () => {
      const { response } = await draft(marketingManager, {
        departmentId: promotionId,
      });
      expect(response.status).toBe(403);
    });
  });
});
