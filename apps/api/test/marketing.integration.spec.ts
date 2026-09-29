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
interface ProblemBody {
  code: string;
}
interface CampaignBody {
  id: string;
  status: string;
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
    expect(await prisma.marketingCampaign.count()).toBe(0);
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
    const noCsrf = await request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies)
      .send({ strategy: "Outreach" });
    expect(noCsrf.status).toBe(403);
    expect(await prisma.marketingCampaign.count()).toBe(0);
  });
});
