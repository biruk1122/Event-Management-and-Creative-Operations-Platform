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

const PASSWORD = "correct horse battery staple";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";
interface ProblemBody {
  code: string;
  requestId?: string;
}
interface CampaignBody {
  id: string;
  status: string;
  manager?: { id: string } | null;
  teams?: { id: string }[];
  progress?: {
    completedActivities: number;
    totalActivities: number;
    percent: number | null;
  };
}
interface StrategyBody {
  campaignId: string;
  strategy: string;
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("marketing strategy API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let cookies: string[];
  let csrf: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "marketing-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "marketing-refresh-token-secret-at-least-32-chars";
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
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    await prisma.user.create({
      data: {
        email: "marketing-admin@example.test",
        credential: {
          create: { passwordHash: await new PasswordHasher().hash(PASSWORD) },
        },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "marketing-admin@example.test", password: PASSWORD });
    expect(login.status).toBe(200);
    cookies = login.headers["set-cookie"] as unknown as string[];
    csrf = cookies
      .find((cookie) => cookie.startsWith("csrf_token="))!
      .split(";")[0]!
      .split("=")[1]!;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function post(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf);
  }

  async function createCampaign(type = "MARKETING") {
    const result = await post("/api/v1/campaigns").send({
      name: `${type} verification`,
      campaignType: type,
    });
    expect(result.status).toBe(201);
    return body<CampaignBody>(result).id;
  }

  it("creates, reads, updates and removes strategy without changing shared campaign state", async () => {
    const id = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${id}/strategy`;
    const created = await post(path).send({
      strategy: "  Local partnerships  ",
    });
    expect(created.status).toBe(201);
    expect(body<StrategyBody>(created)).toMatchObject({
      campaignId: id,
      strategy: "Local partnerships",
    });
    const row = await prisma.marketingCampaign.findUnique({
      where: { campaignId: id },
    });
    expect(row?.strategy).toBe("Local partnerships");

    const read = await request(app.getHttpServer())
      .get(path)
      .set("Cookie", cookies);
    expect(body<StrategyBody>(read).strategy).toBe("Local partnerships");
    const duplicate = await post(path).send({ strategy: "Again" });
    expect(duplicate.status).toBe(409);
    expect(body<ProblemBody>(duplicate).code).toBe(
      "MARKETING_STRATEGY_CONFLICT",
    );
    const retype = await request(app.getHttpServer())
      .patch(`/api/v1/campaigns/${id}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf)
      .send({ campaignType: "PROMOTION" });
    expect(retype.status).toBe(409);
    expect(body<ProblemBody>(retype).code).toBe("CAMPAIGN_TYPE_CONFLICT");

    const updated = await request(app.getHttpServer())
      .patch(path)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf)
      .send({ strategy: "  Radio and social  " });
    expect(updated.status).toBe(200);
    expect(body<StrategyBody>(updated).strategy).toBe("Radio and social");
    const invalidTransition = await post(
      `/api/v1/campaigns/${id}/transition`,
    ).send({ status: "COMPLETED" });
    expect(invalidTransition.status).toBe(409);
    expect(body<ProblemBody>(invalidTransition).code).toBe(
      "CAMPAIGN_INVALID_TRANSITION",
    );
    expect((await prisma.campaign.findUnique({ where: { id } }))?.status).toBe(
      "PLANNED",
    );
    const transitioned = await post(`/api/v1/campaigns/${id}/transition`).send({
      status: "ACTIVE",
    });
    expect(body<CampaignBody>(transitioned).status).toBe("ACTIVE");
    expect(
      (await prisma.marketingCampaign.findUnique({ where: { campaignId: id } }))
        ?.strategy,
    ).toBe("Radio and social");

    const deleted = await request(app.getHttpServer())
      .delete(path)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf);
    expect(deleted.status).toBe(204);
    expect((await prisma.campaign.findUnique({ where: { id } }))?.status).toBe(
      "ACTIVE",
    );
    const missing = await request(app.getHttpServer())
      .get(path)
      .set("Cookie", cookies);
    expect(missing.status).toBe(404);
    expect(body<ProblemBody>(missing).code).toBe(
      "MARKETING_STRATEGY_NOT_FOUND",
    );
  });

  it("rejects invalid text and non-marketing ownership without writing", async () => {
    const marketingId = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${marketingId}/strategy`;
    for (const strategy of ["  ", "x".repeat(2001)]) {
      const invalid = await post(path).send({ strategy });
      expect(invalid.status).toBe(400);
      expect(body<ProblemBody>(invalid).code).toBe("VALIDATION_ERROR");
    }
    const promotionId = await createCampaign("PROMOTION");
    const wrongType = await post(
      `/api/v1/marketing/campaigns/${promotionId}/strategy`,
    ).send({ strategy: "Outreach" });
    expect(wrongType.status).toBe(404);
    expect(body<ProblemBody>(wrongType).code).toBe(
      "MARKETING_CAMPAIGN_NOT_FOUND",
    );
    expect(
      await prisma.marketingCampaign.count({
        where: { campaignId: { in: [marketingId, promotionId] } },
      }),
    ).toBe(0);
  });

  it("requires a scoped update grant and CSRF for mutations", async () => {
    const id = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${id}/strategy`;
    const role = await prisma.role.create({
      data: {
        name: "Marketing reader",
        rolePermissions: {
          create: [{ permissionKey: "campaign.read", scope: "ORGANIZATION" }],
        },
      },
    });
    await prisma.user.create({
      data: {
        email: "marketing-reader@example.test",
        credential: {
          create: { passwordHash: await new PasswordHasher().hash(PASSWORD) },
        },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "marketing-reader@example.test", password: PASSWORD });
    expect(login.status).toBe(200);
    const readerCookies = login.headers["set-cookie"] as unknown as string[];
    const readerCsrf = readerCookies
      .find((cookie) => cookie.startsWith("csrf_token="))!
      .split(";")[0]!
      .split("=")[1]!;
    const denied = await request(app.getHttpServer())
      .post(path)
      .set("Cookie", readerCookies)
      .set("x-csrf-token", readerCsrf)
      .send({ strategy: "Outreach" });
    expect(denied.status).toBe(403);
    expect(body<ProblemBody>(denied).code).toBe("PERMISSION_DENIED");
    expect(body<ProblemBody>(denied).requestId).toBeTruthy();
    const noCsrf = await request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies)
      .send({ strategy: "Outreach" });
    expect(noCsrf.status).toBe(403);
    expect(
      await prisma.marketingCampaign.count({ where: { campaignId: id } }),
    ).toBe(0);
  });

  it("allows read-only access but denies updates and deletes", async () => {
    const id = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${id}/strategy`;
    expect(
      (await post(path).send({ strategy: "Partner outreach" })).status,
    ).toBe(201);
    const role = await prisma.role.create({
      data: {
        name: "Marketing strategy read only",
        rolePermissions: {
          create: [{ permissionKey: "campaign.read", scope: "ORGANIZATION" }],
        },
      },
    });
    await prisma.user.create({
      data: {
        email: "marketing-strategy-reader@example.test",
        credential: {
          create: { passwordHash: await new PasswordHasher().hash(PASSWORD) },
        },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "marketing-strategy-reader@example.test",
        password: PASSWORD,
      });
    expect(login.status).toBe(200);
    const readerCookies = login.headers["set-cookie"] as unknown as string[];
    const readerCsrf = readerCookies
      .find((cookie) => cookie.startsWith("csrf_token="))!
      .split(";")[0]!
      .split("=")[1]!;
    const read = await request(app.getHttpServer())
      .get(path)
      .set("Cookie", readerCookies);
    expect(read.status).toBe(200);
    expect(body<StrategyBody>(read).strategy).toBe("Partner outreach");
    for (const method of ["patch", "delete"] as const) {
      const http = request(app.getHttpServer());
      const denied = await http[method](path)
        .set("Cookie", readerCookies)
        .set("x-csrf-token", readerCsrf)
        .send(method === "patch" ? { strategy: "Changed" } : {});
      expect(denied.status).toBe(403);
      expect(body<ProblemBody>(denied).code).toBe("PERMISSION_DENIED");
    }
    expect(
      (await prisma.marketingCampaign.findUnique({ where: { campaignId: id } }))
        ?.strategy,
    ).toBe("Partner outreach");
  });

  it("returns stable errors for missing campaign and missing strategy", async () => {
    const missingCampaign = await post(
      `/api/v1/marketing/campaigns/${MISSING_UUID}/strategy`,
    ).send({ strategy: "Outreach" });
    expect(missingCampaign.status).toBe(404);
    expect(body<ProblemBody>(missingCampaign).code).toBe("CAMPAIGN_NOT_FOUND");

    const id = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${id}/strategy`;
    for (const method of ["get", "patch", "delete"] as const) {
      const http = request(app.getHttpServer());
      const response = http[method](path).set("Cookie", cookies);
      if (method !== "get") response.set("x-csrf-token", csrf);
      if (method === "patch") response.send({ strategy: "Approach" });
      const result = await response;
      expect(result.status).toBe(404);
      expect(body<ProblemBody>(result).code).toBe(
        "MARKETING_STRATEGY_NOT_FOUND",
      );
    }
  });

  it("keeps strategy attached through shared assignments, activities, and progress", async () => {
    const id = await createCampaign();
    const path = `/api/v1/marketing/campaigns/${id}/strategy`;
    expect(
      (await post(path).send({ strategy: "Local partnerships" })).status,
    ).toBe(201);
    const manager = await prisma.user.create({
      data: { email: "marketing-manager@example.test" },
    });
    const department = await prisma.department.create({
      data: { name: "Marketing strategy verification" },
    });
    const team = await prisma.team.create({
      data: { name: "Marketing campaign team", departmentId: department.id },
    });
    const managerResult = await request(app.getHttpServer())
      .put(`/api/v1/campaigns/${id}/manager`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf)
      .send({ managerId: manager.id });
    expect(managerResult.status).toBe(200);
    expect(body<CampaignBody>(managerResult).manager?.id).toBe(manager.id);
    const teamResult = await request(app.getHttpServer())
      .put(`/api/v1/campaigns/${id}/teams/${team.id}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf);
    expect(teamResult.status).toBe(200);
    expect(
      body<CampaignBody>(teamResult).teams?.map((item) => item.id),
    ).toEqual([team.id]);
    const activity = await post(`/api/v1/campaigns/${id}/activities`).send({
      name: "Partner outreach",
    });
    expect(activity.status).toBe(201);
    const activityId = body<{ id: string }>(activity).id;
    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/campaigns/${id}/activities/${activityId}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf)
      .send({ status: "COMPLETED" });
    expect(completed.status).toBe(200);
    const campaign = await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${id}`)
      .set("Cookie", cookies);
    expect(body<CampaignBody>(campaign).progress).toEqual({
      completedActivities: 1,
      totalActivities: 1,
      percent: 100,
    });
    const strategy = await request(app.getHttpServer())
      .get(path)
      .set("Cookie", cookies);
    expect(strategy.status).toBe(200);
    expect(body<StrategyBody>(strategy).strategy).toBe("Local partnerships");
  });
});
