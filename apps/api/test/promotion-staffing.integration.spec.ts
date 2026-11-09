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
 * EVE-231: promotion activity location and required resources, employee
 * assignees (active employees of the campaign's department only, enforced by a
 * database trigger as well as the service), and the cross-campaign activities
 * list that follows the campaigns' read rules.
 */
const PASSWORD = "correct horse battery staple";

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface ActivityBody {
  activity: { id: string; name?: string; startAt: string | null };
  channel: string;
  location: string | null;
  requiredResources: string | null;
  assignees: { id: string; email: string }[];
}
interface ProblemBody {
  code: string;
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("promotion activity staffing and listing (EVE-231)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let promotionId: string;
  let marketingId: string;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let inactivePromotionMember: Principal;
  let marketingManager: Principal;
  let marketingMember: Principal;
  let sequence = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "promotion-staffing-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "promotion-staffing-refresh-token-secret-at-least-32";
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
    promotionId = (
      await prisma.department.findUniqueOrThrow({
        where: { name: "Promotion" },
      })
    ).id;
    marketingId = (
      await prisma.department.findUniqueOrThrow({
        where: { name: "Marketing" },
      })
    ).id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();

    promotionManager = await principal("Department Manager", promotionId);
    promotionMember = await principal("Department Member", promotionId);
    inactivePromotionMember = await principal("Department Member", promotionId);
    await prisma.user.update({
      where: { id: inactivePromotionMember.id },
      data: { status: "INACTIVE", deactivatedAt: new Date() },
    });
    marketingManager = await principal("Department Manager", marketingId);
    marketingMember = await principal("Department Member", marketingId);
    await prisma.department.update({
      where: { id: promotionId },
      data: { managerId: promotionManager.id },
    });
    await prisma.department.update({
      where: { id: marketingId },
      data: { managerId: marketingManager.id },
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function principal(
    roleName: string,
    departmentId: string,
  ): Promise<Principal> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const email = `staff-${++sequence}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: roleName.split(" ")[0] ?? "User",
        lastName: `${sequence}`,
        departmentId,
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

  /** A promotion campaign with one activity already attached as a radio slot. */
  async function activity(
    name: string,
    startAt: string | null = null,
  ): Promise<string> {
    const campaign = await as(
      promotionManager,
      "post",
      "/api/v1/campaigns",
    ).send({
      name: `Staffing campaign ${++sequence}`,
      campaignType: "PROMOTION",
    });
    expect(campaign.status).toBe(201);
    const campaignId = body<{ id: string }>(campaign).id;
    const created = await as(
      promotionManager,
      "post",
      `/api/v1/campaigns/${campaignId}/activities`,
    ).send({
      name,
      ...(startAt ? { startAt } : {}),
    });
    expect(created.status).toBe(201);
    const activityId = body<{ id: string }>(created).id;
    const attached = await as(
      promotionManager,
      "post",
      `/api/v1/promotion/campaigns/${campaignId}/activities/${activityId}`,
    ).send({ channel: "RADIO_PROMOTION" });
    expect(attached.status).toBe(201);
    return activityId;
  }

  function activityPath(campaignId: string, activityId: string): string {
    return `/api/v1/promotion/campaigns/${campaignId}/activities/${activityId}`;
  }

  async function campaignOf(activityId: string): Promise<string> {
    const row = await prisma.promotionActivity.findUniqueOrThrow({
      where: { campaignActivityId: activityId },
    });
    return row.campaignId;
  }

  describe("location and required resources", () => {
    it("records and clears them for the campaign's department", async () => {
      const activityId = await activity("Street team");
      const campaignId = await campaignOf(activityId);
      const set = await as(
        promotionManager,
        "patch",
        `${activityPath(campaignId, activityId)}/details`,
      ).send({
        location: "  Bole Road junction  ",
        requiredResources: "Van, 4 promoters, 500 flyers",
      });
      expect(set.status).toBe(200);
      expect(body<ActivityBody>(set)).toMatchObject({
        location: "Bole Road junction",
        requiredResources: "Van, 4 promoters, 500 flyers",
      });
      const cleared = await as(
        promotionManager,
        "patch",
        `${activityPath(campaignId, activityId)}/details`,
      ).send({
        location: null,
      });
      expect(body<ActivityBody>(cleared).location).toBeNull();
    });

    it("refuses blank text, and refuses the overseer and team members", async () => {
      const activityId = await activity("Flyer run");
      const campaignId = await campaignOf(activityId);
      const details = `${activityPath(campaignId, activityId)}/details`;
      expect(
        (await as(promotionManager, "patch", details).send({ location: "   " }))
          .status,
      ).toBe(400);
      expect(
        (
          await as(marketingManager, "patch", details).send({
            location: "Elsewhere",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(promotionMember, "patch", details).send({
            location: "Elsewhere",
          })
        ).status,
      ).toBe(403);
    });
  });

  describe("employee assignees", () => {
    it("assigns an active employee of the campaign's department, once", async () => {
      const activityId = await activity("Campus tour");
      const campaignId = await campaignOf(activityId);
      const assignee = `${activityPath(campaignId, activityId)}/assignees/${promotionMember.id}`;
      const assigned = await as(promotionManager, "put", assignee);
      expect(assigned.status).toBe(200);
      expect(
        body<ActivityBody>(assigned).assignees.map((person) => person.id),
      ).toEqual([promotionMember.id]);
      const again = await as(promotionManager, "put", assignee);
      expect(again.status).toBe(409);
      expect(body<ProblemBody>(again).code).toBe("PROMOTION_ASSIGNEE_CONFLICT");
    });

    it("refuses an employee from another department", async () => {
      const activityId = await activity("Cross-team");
      const campaignId = await campaignOf(activityId);
      const response = await as(
        promotionManager,
        "put",
        `${activityPath(campaignId, activityId)}/assignees/${marketingMember.id}`,
      );
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe(
        "PROMOTION_ASSIGNEE_INVALID",
      );
    });

    it("refuses an inactive employee of the same department", async () => {
      const activityId = await activity("Inactive check");
      const campaignId = await campaignOf(activityId);
      const response = await as(
        promotionManager,
        "put",
        `${activityPath(campaignId, activityId)}/assignees/${inactivePromotionMember.id}`,
      );
      expect(response.status).toBe(409);
      expect(body<ProblemBody>(response).code).toBe(
        "PROMOTION_ASSIGNEE_INVALID",
      );
    });

    it("refuses an other-department employee at the database even without the service", async () => {
      const activityId = await activity("Database guard");
      await expect(
        prisma.promotionActivityAssignee.create({
          data: {
            campaignActivityId: activityId,
            userId: marketingMember.id,
            assignedById: promotionManager.id,
          },
        }),
      ).rejects.toThrow(/active employee of the promotion department/);
    });

    it("removes an assignee, and says so when there is none to remove", async () => {
      const activityId = await activity("Removal");
      const campaignId = await campaignOf(activityId);
      const assignee = `${activityPath(campaignId, activityId)}/assignees/${promotionMember.id}`;
      await as(promotionManager, "put", assignee);
      const removed = await as(promotionManager, "delete", assignee);
      expect(removed.status).toBe(200);
      expect(body<ActivityBody>(removed).assignees).toEqual([]);
      const missing = await as(promotionManager, "delete", assignee);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe(
        "PROMOTION_ASSIGNEE_NOT_FOUND",
      );
    });

    it("refuses an assignment from the overseer or a team member", async () => {
      const activityId = await activity("Read only");
      const campaignId = await campaignOf(activityId);
      const assignee = `${activityPath(campaignId, activityId)}/assignees/${promotionMember.id}`;
      expect((await as(marketingManager, "put", assignee)).status).toBe(403);
      expect((await as(promotionMember, "put", assignee)).status).toBe(403);
    });
  });

  describe("assignable employees", () => {
    it("lists every active employee of the campaign's department, with paging and search", async () => {
      const activityId = await activity("Picker source");
      const campaignId = await campaignOf(activityId);
      const path = `/api/v1/promotion/campaigns/${campaignId}/assignable-employees`;

      // Enough department members to need more than one page at pageSize 1.
      const extra = [];
      for (let index = 0; index < 2; index += 1) {
        extra.push(await principal("Department Member", promotionId));
      }

      const first = await as(
        promotionManager,
        "get",
        `${path}?pageSize=1&page=1`,
      );
      expect(first.status).toBe(200);
      const firstBody = body<{ items: { id: string }[]; total: number }>(first);
      expect(firstBody.items).toHaveLength(1);
      // Team members, the manager, the extra members; never the inactive one or Marketing.
      expect(firstBody.total).toBeGreaterThanOrEqual(4);

      const everyone: string[] = [];
      const pages = Math.ceil(firstBody.total / 1);
      for (let page = 1; page <= pages; page += 1) {
        const response = await as(
          promotionManager,
          "get",
          `${path}?pageSize=1&page=${page}`,
        );
        everyone.push(
          ...body<{ items: { id: string }[] }>(response).items.map(
            (item) => item.id,
          ),
        );
      }
      expect(everyone).toEqual(
        expect.arrayContaining([
          promotionMember.id,
          ...extra.map((person) => person.id),
        ]),
      );
      expect(everyone).not.toContain(inactivePromotionMember.id);
      expect(everyone).not.toContain(marketingMember.id);

      const searched = body<{ items: { id: string }[]; total: number }>(
        await as(promotionManager, "get", `${path}?search=staff-&pageSize=100`),
      );
      expect(searched.total).toBeGreaterThanOrEqual(1);
    });

    it("is refused to the overseer and to team members, who cannot assign", async () => {
      const activityId = await activity("Picker refusal");
      const campaignId = await campaignOf(activityId);
      const path = `/api/v1/promotion/campaigns/${campaignId}/assignable-employees`;
      expect((await as(marketingManager, "get", path)).status).toBe(403);
      expect((await as(promotionMember, "get", path)).status).toBe(403);
    });
  });

  describe("cross-campaign activity list", () => {
    it("lists the department's activities with campaign names, and filters by channel and name", async () => {
      const first = await activity("Alpha launch", "2026-12-01T10:00:00.000Z");
      await activity("Beta teaser", "2026-11-20T10:00:00.000Z");
      const listed = body<{
        items: { activity: { name: string } }[];
        total: number;
      }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/promotion/activities?pageSize=100",
        ),
      );
      const names = listed.items.map((item) => item.activity.name);
      expect(names).toEqual(
        expect.arrayContaining(["Alpha launch", "Beta teaser"]),
      );

      const sorted = body<{ items: { activity: { name: string } }[] }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/promotion/activities?sort=NAME&pageSize=100",
        ),
      );
      const sortedNames = sorted.items.map((item) => item.activity.name);
      expect(sortedNames).toEqual(
        [...sortedNames].sort((a, b) => a.localeCompare(b)),
      );

      const byName = body<{
        items: { activity: { id: string } }[];
        total: number;
      }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/promotion/activities?search=alpha",
        ),
      );
      expect(byName.items.map((item) => item.activity.id)).toEqual([first]);
      expect(byName.total).toBe(1);

      const byChannel = body<{ items: unknown[] }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/promotion/activities?channel=TELEVISION",
        ),
      );
      expect(byChannel.items).toEqual([]);
    });

    it("lets the overseer see Promotion's activities and a Marketing member see none of them", async () => {
      const activityId = await activity("Oversight visible");
      const overseer = body<{ items: { activity: { id: string } }[] }>(
        await as(
          marketingManager,
          "get",
          "/api/v1/promotion/activities?pageSize=100",
        ),
      );
      expect(overseer.items.map((item) => item.activity.id)).toContain(
        activityId,
      );
      // A Marketing team member holds no campaign read grant at all, so the
      // list is refused outright rather than returning an empty page.
      const member = await as(
        marketingMember,
        "get",
        "/api/v1/promotion/activities?pageSize=100",
      );
      expect(member.status).toBe(403);
    });

    it("rejects an unknown sort and a malformed date", async () => {
      expect(
        (
          await as(
            promotionManager,
            "get",
            "/api/v1/promotion/activities?sort=COLOR",
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await as(
            promotionManager,
            "get",
            "/api/v1/promotion/activities?from=yesterday",
          )
        ).status,
      ).toBe(400);
    });
  });
});
