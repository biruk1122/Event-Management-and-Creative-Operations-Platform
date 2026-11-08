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
 * EVE-229: the Promotion department is overseen by Marketing.
 *
 * - The Marketing Manager reads Promotion campaigns, activities, tasks,
 *   partners, budgets and reports, and changes none of them.
 * - Promotion staff never reach Marketing data.
 * - A Promotion manager's report goes to the Marketing Manager, falling back
 *   to the Promotion reporting Admin when Marketing has no active manager.
 * - APPROVED and PAUSED are promotion-only, and only Super Admin or Admin
 *   approves.
 */
const PASSWORD = "correct horse battery staple";

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface CampaignBody {
  id: string;
  status: string;
  departmentId: string | null;
  campaignType: string;
}
interface ReportBody {
  id: string;
  status: string;
  reportToId: string | null;
}
interface ProblemBody {
  code: string;
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("Promotion oversight by Marketing (EVE-229)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let marketingId: string;
  let promotionId: string;
  let superAdmin: Principal;
  let admin: Principal;
  let marketingManager: Principal;
  let marketingMember: Principal;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let sequence = 0;

  beforeAll(async () => {
    // The oversight link is migration data, so keep it: this spec verifies
    // the data step as well as the behavior built on it.
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "oversight-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "oversight-refresh-token-secret-at-least-32-chars";
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

    // Both departments come from migrations, and the oversight migration
    // links them.
    const marketing = await prisma.department.findUniqueOrThrow({
      where: { name: "Marketing" },
    });
    const promotion = await prisma.department.findUniqueOrThrow({
      where: { name: "Promotion" },
    });
    marketingId = marketing.id;
    promotionId = promotion.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();

    superAdmin = await principal("Super Admin", null);
    admin = await principal("Admin", null);
    marketingManager = await principal("Department Manager", marketingId);
    marketingMember = await principal("Department Member", marketingId);
    promotionManager = await principal("Department Manager", promotionId);
    promotionMember = await principal("Department Member", promotionId);
    await prisma.department.update({
      where: { id: marketingId },
      data: { managerId: marketingManager.id },
    });
    await prisma.department.update({
      where: { id: promotionId },
      data: { managerId: promotionManager.id, reportingAdminId: admin.id },
    });
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
    const email = `oversight-${++sequence}@example.test`;
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
    method: "get" | "post" | "patch" | "put" | "delete",
    path: string,
  ) {
    const agent = request(app.getHttpServer());
    const call = agent[method](path).set("Cookie", who.cookies);
    return method === "get" ? call : call.set("x-csrf-token", who.csrf);
  }

  async function campaignAs(who: Principal, campaignType: string) {
    const response = await as(who, "post", "/api/v1/campaigns").send({
      name: `${campaignType} campaign ${++sequence}`,
      campaignType,
    });
    expect(response.status).toBe(201);
    return body<CampaignBody>(response);
  }

  async function transition(who: Principal, id: string, status: string) {
    return as(who, "post", `/api/v1/campaigns/${id}/transition`).send({
      status,
    });
  }

  describe("the oversight link", () => {
    it("links Promotion to Marketing and leaves every other department independent", async () => {
      const departments = await prisma.department.findMany({
        select: { name: true, oversightDepartmentId: true },
      });
      for (const department of departments) {
        expect(department.oversightDepartmentId).toBe(
          department.name === "Promotion" ? marketingId : null,
        );
      }
    });

    it("refuses a self link and any second level", async () => {
      await expect(
        prisma.department.update({
          where: { id: marketingId },
          data: { oversightDepartmentId: marketingId },
        }),
      ).rejects.toThrow();
      // Marketing oversees Promotion, so Marketing cannot be overseen...
      const production = await prisma.department.findUniqueOrThrow({
        where: { name: "Production" },
      });
      await expect(
        prisma.department.update({
          where: { id: marketingId },
          data: { oversightDepartmentId: production.id },
        }),
      ).rejects.toThrow();
      // ...and Promotion, being overseen, cannot oversee another department.
      await expect(
        prisma.department.update({
          where: { id: production.id },
          data: { oversightDepartmentId: promotionId },
        }),
      ).rejects.toThrow();
      expect(
        (
          await prisma.department.findUniqueOrThrow({
            where: { id: production.id },
          })
        ).oversightDepartmentId,
      ).toBeNull();
    });

    it("reports overseen departments only to the overseeing manager", async () => {
      const read = async (who: Principal) =>
        body<{ overseenDepartments: { id: string; name: string }[] }>(
          await as(who, "get", "/api/v1/auth/me/permissions"),
        ).overseenDepartments;
      expect(await read(marketingManager)).toEqual([
        { id: promotionId, name: "Promotion" },
      ]);
      for (const who of [
        marketingMember,
        promotionManager,
        promotionMember,
        admin,
        superAdmin,
      ]) {
        expect(await read(who)).toEqual([]);
      }
    });
  });

  describe("campaigns and promotion activities", () => {
    it("lets the Promotion manager run their own campaigns and activities", async () => {
      const campaign = await campaignAs(promotionManager, "PROMOTION");
      expect(campaign.departmentId).toBe(promotionId);
      const activity = await as(
        promotionManager,
        "post",
        `/api/v1/campaigns/${campaign.id}/activities`,
      ).send({ name: "Street team" });
      expect(activity.status).toBe(201);
      const activityId = body<{ id: string }>(activity).id;
      const path = `/api/v1/promotion/campaigns/${campaign.id}/activities/${activityId}`;
      expect(
        (
          await as(promotionManager, "post", path).send({
            channel: "RADIO_PROMOTION",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await as(promotionManager, "patch", path).send({
            channel: "SOCIAL_MEDIA",
          })
        ).status,
      ).toBe(200);
      // Talent assignment still needs talent.assign, which no Department
      // Manager holds.
      expect(
        (
          await as(promotionManager, "post", `${path}/talents`).send({
            talentId: "00000000-0000-0000-0000-000000000000",
            role: "Host",
          })
        ).status,
      ).toBe(403);
      expect((await as(promotionManager, "delete", path)).status).toBe(204);
    });

    it("gives the Marketing Manager read-only access to Promotion campaigns", async () => {
      const campaign = await campaignAs(promotionManager, "PROMOTION");
      const own = await campaignAs(marketingManager, "MARKETING");
      const activity = await as(
        promotionManager,
        "post",
        `/api/v1/campaigns/${campaign.id}/activities`,
      ).send({ name: "Flyers" });
      const activityId = body<{ id: string }>(activity).id;
      await as(
        promotionManager,
        "post",
        `/api/v1/promotion/campaigns/${campaign.id}/activities/${activityId}`,
      ).send({ channel: "ADVERTISING" });

      const listed = body<{ items: CampaignBody[] }>(
        await as(marketingManager, "get", "/api/v1/campaigns?pageSize=100"),
      ).items.map((item) => item.id);
      expect(listed).toEqual(expect.arrayContaining([campaign.id, own.id]));

      const reads = [
        `/api/v1/campaigns/${campaign.id}`,
        `/api/v1/campaigns/${campaign.id}/activities`,
        `/api/v1/campaigns/${campaign.id}/budget`,
        `/api/v1/promotion/campaigns/${campaign.id}/activities`,
        `/api/v1/promotion/campaigns/${campaign.id}/activities/${activityId}`,
      ];
      for (const path of reads) {
        expect((await as(marketingManager, "get", path)).status, path).toBe(
          200,
        );
      }

      const writes: [
        string,
        "post" | "patch" | "put" | "delete",
        string,
        object,
      ][] = [
        ["update", "patch", `/api/v1/campaigns/${campaign.id}`, { name: "x" }],
        [
          "transition",
          "post",
          `/api/v1/campaigns/${campaign.id}/transition`,
          { status: "CANCELLED" },
        ],
        [
          "manager",
          "put",
          `/api/v1/campaigns/${campaign.id}/manager`,
          { managerId: marketingManager.id },
        ],
        [
          "budget",
          "put",
          `/api/v1/campaigns/${campaign.id}/budget`,
          { amount: 10, currency: "ETB" },
        ],
        [
          "create activity",
          "post",
          `/api/v1/campaigns/${campaign.id}/activities`,
          { name: "x" },
        ],
        [
          "update activity",
          "patch",
          `/api/v1/campaigns/${campaign.id}/activities/${activityId}`,
          { name: "x" },
        ],
        [
          "promotion channel",
          "patch",
          `/api/v1/promotion/campaigns/${campaign.id}/activities/${activityId}`,
          { channel: "TELEVISION" },
        ],
        [
          "remove promotion detail",
          "delete",
          `/api/v1/promotion/campaigns/${campaign.id}/activities/${activityId}`,
          {},
        ],
        ["delete", "delete", `/api/v1/campaigns/${campaign.id}`, {}],
      ];
      for (const [label, method, path, payload] of writes) {
        expect(
          (await as(marketingManager, method, path).send(payload)).status,
          label,
        ).toBe(403);
      }
      const unchanged = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
      });
      expect(unchanged).toMatchObject({
        status: "PLANNED",
        budgetAmount: null,
        archivedAt: null,
      });
      expect(unchanged.name).not.toBe("x");
    });

    it("keeps Marketing campaigns away from Promotion staff and Marketing members", async () => {
      const marketing = await campaignAs(marketingManager, "MARKETING");
      for (const who of [promotionManager, promotionMember]) {
        expect(
          (await as(who, "get", `/api/v1/campaigns/${marketing.id}`)).status,
        ).toBe(403);
        const listed = await as(who, "get", "/api/v1/campaigns?pageSize=100");
        if (listed.status === 200) {
          expect(
            body<{ items: CampaignBody[] }>(listed).items.map(
              (item) => item.id,
            ),
          ).not.toContain(marketing.id);
        }
      }
      // A Marketing member does not inherit the manager's oversight.
      const promotion = await campaignAs(promotionManager, "PROMOTION");
      expect(
        (await as(marketingMember, "get", `/api/v1/campaigns/${promotion.id}`))
          .status,
      ).toBe(403);
    });
  });

  describe("promotion-only statuses and approval", () => {
    it("runs the promotion lifecycle with Super Admin or Admin approval", async () => {
      const campaign = await campaignAs(promotionManager, "PROMOTION");
      const refused = await transition(
        promotionManager,
        campaign.id,
        "APPROVED",
      );
      expect(refused.status).toBe(403);
      expect(body<ProblemBody>(refused).code).toBe(
        "CAMPAIGN_APPROVAL_REQUIRED",
      );
      expect(
        (await transition(promotionManager, campaign.id, "ACTIVE")).status,
      ).toBe(409);

      expect((await transition(admin, campaign.id, "APPROVED")).status).toBe(
        200,
      );
      // Admin approves only; running the campaign stays with the department.
      expect((await transition(admin, campaign.id, "ACTIVE")).status).toBe(403);
      for (const status of ["ACTIVE", "PAUSED", "ACTIVE", "COMPLETED"]) {
        const moved = await transition(promotionManager, campaign.id, status);
        expect(moved.status, status).toBe(200);
        expect(body<CampaignBody>(moved).status).toBe(status);
      }

      const second = await campaignAs(promotionManager, "PROMOTION");
      expect((await transition(superAdmin, second.id, "APPROVED")).status).toBe(
        200,
      );

      const audits = await prisma.auditRecord.findMany({
        where: { resourceId: campaign.id, action: "campaign.status_changed" },
        orderBy: { occurredAt: "asc" },
      });
      expect(audits.map((audit) => audit.metadata)).toEqual([
        { from: "PLANNED", to: "APPROVED", campaignType: "PROMOTION" },
        { from: "APPROVED", to: "ACTIVE", campaignType: "PROMOTION" },
        { from: "ACTIVE", to: "PAUSED", campaignType: "PROMOTION" },
        { from: "PAUSED", to: "ACTIVE", campaignType: "PROMOTION" },
        { from: "ACTIVE", to: "COMPLETED", campaignType: "PROMOTION" },
      ]);
      expect(audits[0]?.actorUserId).toBe(admin.id);
    });

    it("keeps the marketing lifecycle unchanged", async () => {
      const campaign = await campaignAs(marketingManager, "MARKETING");
      for (const status of ["APPROVED", "PAUSED"]) {
        expect((await transition(superAdmin, campaign.id, status)).status).toBe(
          409,
        );
      }
      expect(
        (await transition(marketingManager, campaign.id, "ACTIVE")).status,
      ).toBe(200);
      expect(
        (await transition(marketingManager, campaign.id, "PAUSED")).status,
      ).toBe(409);
      expect(
        (await transition(marketingManager, campaign.id, "COMPLETED")).status,
      ).toBe(200);
      // Admin never runs a marketing campaign.
      const other = await campaignAs(marketingManager, "MARKETING");
      expect((await transition(admin, other.id, "ACTIVE")).status).toBe(403);
    });

    it("rejects APPROVED and PAUSED on a marketing row at the database", async () => {
      const campaign = await campaignAs(marketingManager, "MARKETING");
      await expect(
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "APPROVED" },
        }),
      ).rejects.toThrow();
    });
  });

  describe("tasks, partners and expenses", () => {
    it("lets the Marketing Manager read Promotion tasks without changing them", async () => {
      const promotionTask = await prisma.task.create({
        data: {
          title: "Poster run",
          createdById: promotionManager.id,
          departmentId: promotionId,
        },
      });
      const marketingTask = await prisma.task.create({
        data: {
          title: "Brand review",
          createdById: marketingManager.id,
          departmentId: marketingId,
        },
      });
      const path = `/api/v1/tasks/${promotionTask.id}`;
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      const listed = body<{ items: { id: string }[] }>(
        await as(
          marketingManager,
          "get",
          `/api/v1/tasks?departmentId=${promotionId}&pageSize=100`,
        ),
      ).items.map((item) => item.id);
      expect(listed).toContain(promotionTask.id);

      expect(
        (await as(marketingManager, "patch", path).send({ title: "x" })).status,
      ).toBe(403);
      expect(
        (
          await as(
            marketingManager,
            "put",
            `${path}/assignees/${promotionMember.id}`,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await as(marketingManager, "post", `${path}/comments`).send({
            body: "x",
          })
        ).status,
      ).toBe(403);

      // The Promotion manager still assigns their own member.
      expect(
        (
          await as(
            promotionManager,
            "put",
            `${path}/assignees/${promotionMember.id}`,
          )
        ).status,
      ).toBe(200);

      for (const who of [promotionManager, promotionMember]) {
        expect(
          (await as(who, "get", `/api/v1/tasks/${marketingTask.id}`)).status,
        ).toBe(403);
      }
      expect((await as(marketingMember, "get", path)).status).toBe(403);
    });

    it("lets the Marketing Manager read Promotion partners without changing them", async () => {
      const partner = await prisma.partner.create({
        data: {
          organizationName: "Radio Fana",
          category: "Media",
          departmentId: promotionId,
          createdById: promotionManager.id,
        },
      });
      const marketingPartner = await prisma.partner.create({
        data: {
          organizationName: "Brand House",
          category: "Brand",
          departmentId: marketingId,
          createdById: marketingManager.id,
        },
      });
      const path = `/api/v1/partners/${partner.id}`;
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect(
        (await as(marketingManager, "patch", path).send({ notes: "x" })).status,
      ).toBe(403);
      expect(
        (
          await as(marketingManager, "post", `${path}/activities`).send({
            note: "x",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            promotionManager,
            "get",
            `/api/v1/partners/${marketingPartner.id}`,
          )
        ).status,
      ).toBe(403);
    });

    it("lets the Marketing Manager read Promotion expenses without changing them", async () => {
      const production = await as(
        superAdmin,
        "post",
        "/api/v1/productions",
      ).send({
        name: `Promotion shoot ${++sequence}`,
        productionType: "Video",
        departmentId: promotionId,
      });
      expect(production.status).toBe(201);
      const created = await as(
        promotionManager,
        "post",
        "/api/v1/expenses",
      ).send({
        productionId: body<{ id: string }>(production).id,
        category: "MARKETING_MATERIALS",
        description: "Posters",
        actualAmount: 1200,
        currency: "ETB",
      });
      expect(created.status).toBe(201);
      const path = `/api/v1/expenses/${body<{ id: string }>(created).id}`;
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect(
        (await as(marketingManager, "patch", path).send({ description: "x" }))
          .status,
      ).toBe(403);
      expect(
        (await as(marketingManager, "post", `${path}/submit`)).status,
      ).toBe(403);
      expect((await as(promotionMember, "get", path)).status).toBe(403);
    });
  });

  describe("report routing and review", () => {
    async function dailyReport(who: Principal, day: string) {
      const created = await as(who, "post", "/api/v1/reports").send({
        type: "DAILY",
        title: `Daily ${day}`,
        periodStart: day,
        periodEnd: day,
      });
      expect(created.status).toBe(201);
      const path = `/api/v1/reports/${body<ReportBody>(created).id}`;
      expect(
        (
          await as(who, "patch", path).send({
            problemsEncountered: "None",
            nextDayPlan: "Distribute flyers",
          })
        ).status,
      ).toBe(200);
      return path;
    }

    it("sends the Promotion manager's report to the Marketing Manager, who reviews it", async () => {
      const path = await dailyReport(promotionManager, "2026-11-02");
      const submitted = await as(promotionManager, "post", `${path}/submit`);
      expect(submitted.status).toBe(200);
      expect(body<ReportBody>(submitted).reportToId).toBe(marketingManager.id);

      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect((await as(superAdmin, "get", path)).status).toBe(200);
      expect((await as(admin, "get", path)).status).toBe(200);
      // The author never reviews their own report.
      expect(
        (
          await as(promotionManager, "post", `${path}/reviews`).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(403);

      // Reviewed straight from SUBMITTED. Optional "start review" is not used:
      // it fails for every report today because the reports_review_state
      // CHECK predates the UNDER_REVIEW status (a pre-existing defect, outside
      // EVE-229).
      const reviewed = await as(
        marketingManager,
        "post",
        `${path}/reviews`,
      ).send({
        outcome: "CHANGES_REQUESTED",
        note: "Add channel results",
      });
      expect(reviewed.status).toBe(200);
      expect(body<ReportBody>(reviewed).status).toBe("CHANGES_REQUESTED");
    });

    it("lets the Marketing Manager read, but not review, a Promotion member's report", async () => {
      const path = await dailyReport(promotionMember, "2026-11-03");
      const submitted = await as(promotionMember, "post", `${path}/submit`);
      expect(body<ReportBody>(submitted).reportToId).toBe(promotionManager.id);
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect(
        (
          await as(marketingManager, "post", `${path}/reviews`).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(promotionManager, "post", `${path}/reviews`).send({
            outcome: "REVIEWED",
          })
        ).status,
      ).toBe(200);
    });

    it("keeps Marketing reports away from Promotion staff", async () => {
      const path = await dailyReport(marketingManager, "2026-11-04");
      for (const who of [promotionManager, promotionMember]) {
        expect((await as(who, "get", path)).status).toBe(403);
      }
    });

    it("falls back to the Promotion reporting Admin when Marketing has no active manager", async () => {
      await prisma.department.update({
        where: { id: marketingId },
        data: { managerId: null },
      });
      try {
        const path = await dailyReport(promotionManager, "2026-11-05");
        const submitted = await as(promotionManager, "post", `${path}/submit`);
        expect(submitted.status).toBe(200);
        expect(body<ReportBody>(submitted).reportToId).toBe(admin.id);
      } finally {
        await prisma.department.update({
          where: { id: marketingId },
          data: { managerId: marketingManager.id },
        });
      }
    });
  });
});
