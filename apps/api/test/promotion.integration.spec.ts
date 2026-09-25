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

interface IdBody {
  id: string;
}
interface ProblemBody {
  code: string;
}
interface PromotionBody {
  activity: { id: string; status: string };
  channel: string;
  talents: { talentId: string; role: string }[];
}
interface PromotionPage {
  items: PromotionBody[];
  total: number;
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

describe("promotion operations API smoke", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let cookies: string[];
  let csrfToken: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "promotion-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "promotion-refresh-token-secret-at-least-32-chars";
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);
    const [
      { Test },
      { AppModule },
      { configureApplication },
      { PasswordHasher },
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    const actor = await prisma.user.create({
      data: {
        email: "promotion-smoke@example.test",
        credential: {
          create: { passwordHash: await new PasswordHasher().hash(PASSWORD) },
        },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    expect(actor.id).toBeTruthy();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "promotion-smoke@example.test", password: PASSWORD });
    expect(login.status).toBe(200);
    cookies = login.headers["set-cookie"] as unknown as string[];
    csrfToken = cookies
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
      .set("x-csrf-token", csrfToken);
  }

  it("attaches a channel and talent to a promotion activity, then lists it and reports stable errors", async () => {
    const campaign = await post("/api/v1/campaigns").send({
      name: "Radio campaign",
      campaignType: "PROMOTION",
    });
    expect(campaign.status).toBe(201);
    const campaignId = body<IdBody>(campaign).id;
    const activity = await post(
      `/api/v1/campaigns/${campaignId}/activities`,
    ).send({ name: "Broadcast" });
    expect(activity.status).toBe(201);
    const activityId = body<IdBody>(activity).id;
    const talent = await prisma.talent.create({
      data: { fullName: "Presenter", type: "ARTIST" },
    });
    const path = `/api/v1/promotion/campaigns/${campaignId}/activities/${activityId}`;

    const attached = await post(path).send({
      channel: "RADIO_PROMOTION",
      talents: [{ talentId: talent.id, role: " Host " }],
    });
    expect(attached.status, JSON.stringify(body<unknown>(attached))).toBe(201);
    expect(body<PromotionBody>(attached).channel).toBe("RADIO_PROMOTION");
    expect(body<PromotionBody>(attached).talents).toMatchObject([
      { talentId: talent.id, role: "Host" },
    ]);
    expect(
      body<ProblemBody>(await post(path).send({ channel: "RADIO_PROMOTION" }))
        .code,
    ).toBe("PROMOTION_DETAIL_CONFLICT");
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/promotion/campaigns/${campaignId}/activities`)
      .set("Cookie", cookies);
    expect(listed.status).toBe(200);
    expect(body<PromotionPage>(listed).total).toBe(1);
    expect(body<PromotionPage>(listed).items[0]!.activity.id).toBe(activityId);

    const transitioned = await request(app.getHttpServer())
      .patch(`/api/v1/campaigns/${campaignId}/activities/${activityId}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({ status: "COMPLETED" });
    expect(transitioned.status).toBe(200);
    const refreshed = await request(app.getHttpServer())
      .get(path)
      .set("Cookie", cookies);
    expect(body<PromotionBody>(refreshed).activity.status).toBe("COMPLETED");
    const completed = await request(app.getHttpServer())
      .get(
        `/api/v1/promotion/campaigns/${campaignId}/activities?status=COMPLETED`,
      )
      .set("Cookie", cookies);
    expect(body<PromotionPage>(completed).total).toBe(1);
    const planned = await request(app.getHttpServer())
      .get(
        `/api/v1/promotion/campaigns/${campaignId}/activities?status=PLANNED`,
      )
      .set("Cookie", cookies);
    expect(body<PromotionPage>(planned).total).toBe(0);

    const secondTalent = await prisma.talent.create({
      data: { fullName: "Singer", type: "ARTIST" },
    });
    const assignmentPath = `${path}/talents`;
    const assigned = await post(assignmentPath).send({
      talentId: secondTalent.id,
      role: "Singer",
    });
    expect(assigned.status).toBe(201);
    expect(body<PromotionBody>(assigned).talents).toHaveLength(2);
    const duplicate = await post(assignmentPath).send({
      talentId: secondTalent.id,
      role: "Singer",
    });
    expect(duplicate.status).toBe(409);
    expect(body<ProblemBody>(duplicate).code).toBe(
      "PROMOTION_ASSIGNMENT_CONFLICT",
    );
    const unassigned = await request(app.getHttpServer())
      .delete(`${assignmentPath}/${secondTalent.id}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken);
    expect(unassigned.status).toBe(200);
    expect(body<PromotionBody>(unassigned).talents).toHaveLength(1);

    expect((await request(app.getHttpServer()).get(path)).status).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post(path)
          .set("Cookie", cookies)
          .send({ channel: "SOCIAL_MEDIA" })
      ).status,
    ).toBe(403);

    const marketing = await post("/api/v1/campaigns").send({
      name: "Marketing",
      campaignType: "MARKETING",
    });
    const hidden = await request(app.getHttpServer())
      .get(
        `/api/v1/promotion/campaigns/${body<IdBody>(marketing).id}/activities`,
      )
      .set("Cookie", cookies);
    expect(hidden.status).toBe(404);
    expect(body<ProblemBody>(hidden).code).toBe("PROMOTION_CAMPAIGN_NOT_FOUND");
    const invalid = await post(path).send({ channel: "UNKNOWN" });
    expect(invalid.status).toBe(400);
    expect(body<ProblemBody>(invalid).code).toBe("VALIDATION_ERROR");

    const changed = await request(app.getHttpServer())
      .patch(path)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({ channel: "SOCIAL_MEDIA" });
    expect(changed.status).toBe(200);
    expect(body<PromotionBody>(changed).channel).toBe("SOCIAL_MEDIA");
    const removed = await request(app.getHttpServer())
      .delete(path)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken);
    expect(removed.status).toBe(204);
    expect(
      await prisma.promotionActivity.count({
        where: { campaignActivityId: activityId },
      }),
    ).toBe(0);
    expect(
      await prisma.campaignActivity.count({ where: { id: activityId } }),
    ).toBe(1);
  });
});
