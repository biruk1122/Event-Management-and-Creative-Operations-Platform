import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import type {
  ObjectStorage,
  StoredObject,
} from "../src/file-management/storage/object-storage.js";
import type { FileScanner } from "../src/file-management/file-scanner.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * EVE-233: campaign expenses (optionally on one of the campaign's own
 * activities), the campaign budget summary, partnership fields and documents,
 * and who may do each. The Marketing Manager oversees Promotion read-only.
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
interface Summary {
  campaignId: string;
  currency: string | null;
  allocated: string | null;
  approved: string;
  pending: string;
  spent: string;
  remaining: string | null;
  utilizationPercent: number | null;
  overBudget: boolean;
  byActivity: {
    campaignActivityId: string | null;
    activityName: string | null;
    spent: string;
  }[];
  committedPartnershipValue: string;
  partnerships: { id: string; agreedValueAmount: string | null }[];
}
function body<T>(response: request.Response): T {
  return response.body as T;
}

class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  createUploadGrant(input: { key: string; mediaType: string }) {
    return Promise.resolve({
      fields: { "Content-Type": input.mediaType, key: input.key },
      url: "https://storage.test/upload",
    });
  }
  readObject(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
  createDownloadGrant(input: { key: string }) {
    return Promise.resolve({
      expiresAt: new Date("2030-01-01T00:05:00.000Z"),
      url: `https://storage.test/download/${encodeURIComponent(input.key)}`,
    });
  }
  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

class PassingScanner implements FileScanner {
  scan(): Promise<"clean" | "infected" | "unavailable"> {
    return Promise.resolve("clean");
  }
}

describe("campaign expenses, budget and partnerships (EVE-233)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let storage: MemoryStorage;
  let promotionId: string;
  let marketingId: string;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let marketingManager: Principal;
  let superAdmin: Principal;
  let sequence = 0;
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

  beforeAll(async () => {
    // Keep migration data: departments and the Promotion -> Marketing link.
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "campaign-budget-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "campaign-budget-refresh-token-secret-at-least-32";
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
      { FILE_OBJECT_STORAGE },
      { FILE_SCANNER },
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/file-management/storage/object-storage.js"),
      import("../src/file-management/file-scanner.js"),
    ]);
    const department = async (name: string) =>
      (await prisma.department.findUniqueOrThrow({ where: { name } })).id;
    promotionId = await department("Promotion");
    marketingId = await department("Marketing");

    storage = new MemoryStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(storage)
      .overrideProvider(FILE_SCANNER)
      .useValue(new PassingScanner())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();

    promotionManager = await principal("Department Manager", promotionId);
    promotionMember = await principal("Department Member", promotionId);
    marketingManager = await principal("Department Manager", marketingId);
    superAdmin = await principal("Super Admin", null);
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
    departmentId: string | null,
  ): Promise<Principal> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const email = `budget-${++sequence}@example.test`;
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

  /** A Promotion campaign with a budget and two activities. */
  async function campaign(budget: number | null = 1000) {
    const workspace = await prisma.workspace.create({
      data: { kind: "CAMPAIGN" },
    });
    const created = await prisma.campaign.create({
      data: {
        name: `Campaign ${++sequence}`,
        campaignType: "PROMOTION",
        departmentId: promotionId,
        workspaceId: workspace.id,
      },
    });
    if (budget !== null) {
      const set = await as(
        promotionManager,
        "put",
        `/api/v1/campaigns/${created.id}/budget`,
      ).send({ amount: budget, currency: "ETB" });
      expect(set.status).toBe(200);
    }
    const activity = async (name: string) =>
      (
        await prisma.campaignActivity.create({
          data: { campaignId: created.id, name },
        })
      ).id;
    return {
      id: created.id,
      flyerRunId: await activity("Flyer run"),
      radioId: await activity("Radio slot"),
    };
  }

  async function expense(
    who: Principal,
    payload: Record<string, unknown>,
  ): Promise<request.Response> {
    return as(who, "post", "/api/v1/expenses").send({
      category: "MARKETING_MATERIALS",
      description: "Printing",
      actualAmount: 100,
      currency: "ETB",
      ...payload,
    });
  }

  describe("campaign expenses", () => {
    it("records a campaign expense, optionally on one of its activities", async () => {
      const c = await campaign();
      const created = await expense(promotionManager, {
        campaignId: c.id,
        campaignActivityId: c.flyerRunId,
        title: "Flyer printing",
        expenseDate: "2026-11-09",
      });
      expect(created.status).toBe(201);
      expect(
        body<{
          campaignId: string;
          campaignActivityId: string;
          departmentId: string;
          title: string;
          expenseDate: string;
          createdById: string;
          updatedById: string;
        }>(created),
      ).toMatchObject({
        campaignId: c.id,
        campaignActivityId: c.flyerRunId,
        departmentId: promotionId,
        title: "Flyer printing",
        expenseDate: "2026-11-09",
        createdById: promotionManager.id,
        updatedById: promotionManager.id,
      });
      const plain = await expense(promotionManager, { campaignId: c.id });
      expect(plain.status).toBe(201);
    });

    it("refuses an activity from another campaign, and an activity without a campaign", async () => {
      const first = await campaign();
      const second = await campaign();
      const crossed = await expense(promotionManager, {
        campaignId: first.id,
        campaignActivityId: second.flyerRunId,
      });
      expect(crossed.status).toBe(400);
      expect(body<ProblemBody>(crossed).code).toBe(
        "EXPENSE_ACTIVITY_OUTSIDE_CAMPAIGN",
      );
      const loose = await expense(promotionManager, {
        campaignActivityId: first.flyerRunId,
      });
      expect(loose.status).toBe(400);

      // Editing an expense onto another campaign's activity is refused too.
      const created = body<{ id: string }>(
        await expense(promotionManager, { campaignId: first.id }),
      );
      const moved = await as(
        promotionManager,
        "patch",
        `/api/v1/expenses/${created.id}`,
      ).send({ campaignActivityId: second.radioId });
      expect(moved.status).toBe(400);
      const ok = await as(
        promotionManager,
        "patch",
        `/api/v1/expenses/${created.id}`,
      ).send({ campaignActivityId: first.radioId, title: "Radio ad" });
      expect(ok.status).toBe(200);
    });

    it("keeps an activity on its own campaign at the database too", async () => {
      const first = await campaign();
      const second = await campaign();
      await expect(
        prisma.expense.create({
          data: {
            campaignId: first.id,
            campaignActivityId: second.flyerRunId,
            departmentId: promotionId,
            category: "MISCELLANEOUS",
            description: "Crossed",
            actualAmount: "1.00",
            currency: "ETB",
          },
        }),
      ).rejects.toThrow();
    });

    it("lets only the campaign's own department record expenses", async () => {
      const c = await campaign();
      expect(
        (await expense(marketingManager, { campaignId: c.id })).status,
      ).toBe(403);
      expect(
        (await expense(promotionMember, { campaignId: c.id })).status,
      ).toBe(403);
      expect((await expense(superAdmin, { campaignId: c.id })).status).toBe(
        201,
      );
    });

    it("refuses to delete a campaign that has expenses", async () => {
      const c = await campaign();
      await expense(promotionManager, { campaignId: c.id });
      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/campaigns/${c.id}`,
      );
      expect(removed.status).toBe(409);
      expect(body<ProblemBody>(removed).code).toBe("CAMPAIGN_HAS_EXPENSES");
    });

    it("takes receipts on a campaign expense", async () => {
      const c = await campaign();
      const created = body<{ id: string }>(
        await expense(promotionManager, { campaignId: c.id }),
      );
      const intent = await as(
        promotionManager,
        "post",
        `/api/v1/expenses/${created.id}/files/upload-intents`,
      ).send({
        filename: "receipt.pdf",
        mediaType: "application/pdf",
        sizeBytes: pdf.byteLength,
      });
      expect(intent.status).toBe(201);
      const file = body<{ id: string; upload: { fields: { key: string } } }>(
        intent,
      );
      storage.objects.set(file.upload.fields.key, {
        bytes: pdf,
        mediaType: "application/pdf",
        sizeBytes: pdf.byteLength,
      });
      const finalized = await as(
        promotionManager,
        "post",
        `/api/v1/expenses/${created.id}/files/${file.id}/finalize`,
      );
      expect(finalized.status).toBe(200);
    });
  });

  describe("budget summary", () => {
    it("adds up submitted and approved spending exactly, by activity", async () => {
      const c = await campaign(1000);
      const make = async (amount: number, activity: string | null) =>
        body<{ id: string }>(
          await expense(promotionManager, {
            campaignId: c.id,
            actualAmount: amount,
            ...(activity ? { campaignActivityId: activity } : {}),
          }),
        ).id;
      const approved = await make(100.1, c.flyerRunId);
      const pending = await make(200.2, null);
      await make(999, c.radioId); // stays a draft: not spending
      const rejected = await make(999, c.radioId);
      for (const id of [approved, pending, rejected]) {
        expect(
          (await as(promotionManager, "post", `/api/v1/expenses/${id}/submit`))
            .status,
        ).toBe(200);
      }
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/expenses/${approved}/reviews`,
          ).send({ outcome: "APPROVED" })
        ).status,
      ).toBe(200);
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/expenses/${rejected}/reviews`,
          ).send({ outcome: "REJECTED", note: "Duplicate" })
        ).status,
      ).toBe(200);

      const summary = body<Summary>(
        await as(
          promotionManager,
          "get",
          `/api/v1/campaigns/${c.id}/budget-summary`,
        ),
      );
      expect(summary).toMatchObject({
        currency: "ETB",
        allocated: "1000.00",
        approved: "100.10",
        pending: "200.20",
        spent: "300.30",
        remaining: "699.70",
        utilizationPercent: 30,
        overBudget: false,
      });
      expect(summary.byActivity).toEqual(
        expect.arrayContaining([
          {
            campaignActivityId: c.flyerRunId,
            activityName: "Flyer run",
            spent: "100.10",
          },
          { campaignActivityId: null, activityName: null, spent: "200.20" },
        ]),
      );
      expect(summary.byActivity).toHaveLength(2);
    });

    it("shows partnership values separately and never as spending", async () => {
      const c = await campaign(1000);
      const partner = await as(
        promotionManager,
        "post",
        "/api/v1/partners",
      ).send({
        organizationName: "Brightside Media",
        category: "Media",
        partnershipName: "Festival media partnership",
        partnershipType: "MEDIA",
        campaignId: c.id,
        agreedValueAmount: 5000,
        agreedValueCurrency: "ETB",
      });
      expect(partner.status).toBe(201);
      const id = body<{ id: string }>(partner).id;
      await as(promotionManager, "patch", `/api/v1/partners/${id}`).send({
        status: "COMMITTED",
      });
      const summary = body<Summary>(
        await as(
          promotionManager,
          "get",
          `/api/v1/campaigns/${c.id}/budget-summary`,
        ),
      );
      expect(summary.spent).toBe("0.00");
      expect(summary.remaining).toBe("1000.00");
      expect(summary.committedPartnershipValue).toBe("5000.00");
      expect(summary.partnerships).toEqual([
        expect.objectContaining({ id, agreedValueAmount: "5000.00" }),
      ]);
    });

    it("gives the Marketing Manager read-only budget oversight", async () => {
      const c = await campaign(500);
      const read = await as(
        marketingManager,
        "get",
        `/api/v1/campaigns/${c.id}/budget-summary`,
      );
      expect(read.status).toBe(200);
      const list = body<{ items: { campaignId: string }[] }>(
        await as(
          marketingManager,
          "get",
          "/api/v1/campaigns/budget-summaries?campaignType=PROMOTION&pageSize=100",
        ),
      );
      expect(list.items.map((item) => item.campaignId)).toContain(c.id);
      expect(
        (
          await as(
            marketingManager,
            "put",
            `/api/v1/campaigns/${c.id}/budget`,
          ).send({ amount: 1, currency: "ETB" })
        ).status,
      ).toBe(403);
    });

    it("keeps the budget from a team member", async () => {
      const c = await campaign(500);
      expect(
        (
          await as(
            promotionMember,
            "get",
            `/api/v1/campaigns/${c.id}/budget-summary`,
          )
        ).status,
      ).toBe(403);
    });
  });

  describe("partnerships", () => {
    it("stores the agreement and who last changed it", async () => {
      const c = await campaign();
      const created = await as(
        promotionManager,
        "post",
        "/api/v1/partners",
      ).send({
        organizationName: "Sunrise Brands",
        category: "Brand",
        partnershipName: "Summer sampling",
        partnershipType: "BRAND",
        agreementDetails: "Product sampling at three events.",
        agreementStartOn: "2026-11-01",
        agreementEndOn: "2027-01-31",
        agreedValueAmount: 12000.5,
        agreedValueCurrency: "ETB",
        campaignId: c.id,
      });
      expect(created.status).toBe(201);
      const partner = body<Record<string, unknown> & { id: string }>(created);
      expect(partner).toMatchObject({
        partnershipName: "Summer sampling",
        partnershipType: "BRAND",
        agreementStartOn: "2026-11-01",
        agreementEndOn: "2027-01-31",
        agreedValueAmount: "12000.50",
        agreedValueCurrency: "ETB",
        campaignId: c.id,
      });
      const updated = await as(
        superAdmin,
        "patch",
        `/api/v1/partners/${partner.id}`,
      ).send({ agreementDetails: "Sampling at four events." });
      expect(
        body<{ updatedBy: { id: string } | null }>(updated).updatedBy?.id,
      ).toBe(superAdmin.id);
    });

    it("refuses an agreement that ends before it starts, or a value without a currency", async () => {
      const badDates = await as(
        promotionManager,
        "post",
        "/api/v1/partners",
      ).send({
        organizationName: "Late Co",
        category: "Brand",
        agreementStartOn: "2027-01-31",
        agreementEndOn: "2026-11-01",
      });
      expect(body<ProblemBody>(badDates).code).toBe(
        "PARTNER_AGREEMENT_DATES_INVALID",
      );
      const noCurrency = await as(
        promotionManager,
        "post",
        "/api/v1/partners",
      ).send({
        organizationName: "Value Co",
        category: "Brand",
        agreedValueAmount: 10,
      });
      expect(body<ProblemBody>(noCurrency).code).toBe(
        "PARTNER_AGREED_VALUE_INCOMPLETE",
      );
      // A partial edit is checked against the stored agreement.
      const valid = body<{ id: string }>(
        await as(promotionManager, "post", "/api/v1/partners").send({
          organizationName: "Dated Co",
          category: "Brand",
          agreementStartOn: "2026-11-01",
        }),
      );
      const backwards = await as(
        promotionManager,
        "patch",
        `/api/v1/partners/${valid.id}`,
      ).send({ agreementEndOn: "2026-10-01" });
      expect(body<ProblemBody>(backwards).code).toBe(
        "PARTNER_AGREEMENT_DATES_INVALID",
      );
    });

    it("takes documents from the department and lets oversight read them", async () => {
      const partner = body<{ id: string }>(
        await as(promotionManager, "post", "/api/v1/partners").send({
          organizationName: "Docs Ltd",
          category: "Media",
        }),
      );
      const upload = async (who: Principal) => {
        const intent = await as(
          who,
          "post",
          `/api/v1/partners/${partner.id}/files/upload-intents`,
        ).send({
          filename: "agreement.pdf",
          mediaType: "application/pdf",
          sizeBytes: pdf.byteLength,
        });
        if (intent.status !== 201) return { status: intent.status };
        const file = body<{ id: string; upload: { fields: { key: string } } }>(
          intent,
        );
        storage.objects.set(file.upload.fields.key, {
          bytes: pdf,
          mediaType: "application/pdf",
          sizeBytes: pdf.byteLength,
        });
        const finalized = await as(
          who,
          "post",
          `/api/v1/partners/${partner.id}/files/${file.id}/finalize`,
        );
        return { status: finalized.status, fileId: file.id };
      };
      const uploaded = await upload(promotionManager);
      expect(uploaded.status).toBe(200);
      expect((await upload(marketingManager)).status).toBe(403);
      const listed = body<{ items: { id: string }[] }>(
        await as(
          marketingManager,
          "get",
          `/api/v1/partners/${partner.id}/files`,
        ),
      );
      expect(listed.items.map((item) => item.id)).toEqual([uploaded.fileId]);
      expect(
        (
          await as(
            marketingManager,
            "get",
            `/api/v1/partners/${partner.id}/files/${uploaded.fileId}/download`,
          )
        ).status,
      ).toBe(200);
    });

    it("refuses partnership writes from the overseeing manager", async () => {
      const partner = body<{ id: string }>(
        await as(promotionManager, "post", "/api/v1/partners").send({
          organizationName: "Guarded Inc",
          category: "Media",
        }),
      );
      expect(
        (
          await as(
            marketingManager,
            "patch",
            `/api/v1/partners/${partner.id}`,
          ).send({ partnershipName: "Taken over" })
        ).status,
      ).toBe(403);
    });
  });
});
