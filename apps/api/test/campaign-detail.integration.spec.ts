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
 * EVE-231: campaign detail (objectives and one related link), the append-only
 * updates log, recorded metrics, and campaign files. Promotion staff write;
 * the overseeing Marketing Manager reads and writes nothing.
 */
const PASSWORD = "correct horse battery staple";

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface CampaignBody {
  id: string;
  departmentId: string | null;
  objectives: string | null;
  projectId: string | null;
  productionId: string | null;
  talentId: string | null;
}
interface ProblemBody {
  code: string;
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

describe("campaign detail, updates, metrics and files (EVE-231)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let storage: MemoryStorage;
  let promotionId: string;
  let marketingId: string;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let marketingManager: Principal;
  let projectId: string;
  let productionId: string;
  let talentId: string;
  let sequence = 0;

  beforeAll(async () => {
    // The oversight link is migration data; keep it (see promotion-oversight).
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "campaign-detail-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "campaign-detail-refresh-token-secret-at-least-32";
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

    // Linkable records: a project, a production and an artist.
    const projectWorkspace = await prisma.workspace.create({
      data: { kind: "PROJECT" },
    });
    projectId = (
      await prisma.project.create({
        data: { name: "Summer tour", workspaceId: projectWorkspace.id },
      })
    ).id;
    const productionWorkspace = await prisma.workspace.create({
      data: { kind: "PRODUCTION" },
    });
    productionId = (
      await prisma.production.create({
        data: {
          name: "Launch film",
          productionType: "Video",
          workspaceId: productionWorkspace.id,
        },
      })
    ).id;
    talentId = (
      await prisma.talent.create({
        data: { fullName: "Lead artist", type: "ARTIST" },
      })
    ).id;

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
    const email = `detail-${++sequence}@example.test`;
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

  async function promotionCampaign(): Promise<CampaignBody> {
    const response = await as(
      promotionManager,
      "post",
      "/api/v1/campaigns",
    ).send({
      name: `Promotion detail ${++sequence}`,
      campaignType: "PROMOTION",
    });
    expect(response.status).toBe(201);
    return body<CampaignBody>(response);
  }

  describe("campaign detail", () => {
    it("sets and reads objectives, and refuses a blank objective", async () => {
      const campaign = await promotionCampaign();
      const set = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        objectives: "  Fill the Friday show  ",
      });
      expect(set.status).toBe(200);
      expect(body<CampaignBody>(set).objectives).toBe("Fill the Friday show");

      const blank = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        objectives: "   ",
      });
      expect(blank.status).toBe(400);
    });

    it("links one project, production or artist, and refuses a second link", async () => {
      const campaign = await promotionCampaign();
      const linked = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        projectId,
      });
      expect(linked.status).toBe(200);
      expect(body<CampaignBody>(linked).projectId).toBe(projectId);

      const second = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        talentId,
      });
      expect(second.status).toBe(409);
      expect(body<ProblemBody>(second).code).toBe(
        "CAMPAIGN_RELATED_LINK_CONFLICT",
      );

      const cleared = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        projectId: null,
        talentId,
      });
      expect(cleared.status).toBe(200);
      expect(body<CampaignBody>(cleared)).toMatchObject({
        projectId: null,
        talentId,
      });
    });

    it("refuses a link to a record that does not exist", async () => {
      const campaign = await promotionCampaign();
      const missing = await as(
        promotionManager,
        "patch",
        `/api/v1/campaigns/${campaign.id}`,
      ).send({
        productionId: "00000000-0000-0000-0000-000000000000",
      });
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe(
        "CAMPAIGN_RELATED_LINK_NOT_FOUND",
      );
    });

    it("refuses two links at the database, not only in the service", async () => {
      const campaign = await promotionCampaign();
      await expect(
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { projectId, productionId },
        }),
      ).rejects.toThrow();
    });
  });

  describe("updates log", () => {
    it("lets the department add entries and lists them newest first", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/updates`;
      expect(
        (
          await as(promotionManager, "post", path).send({
            note: "Venue confirmed",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await as(promotionManager, "post", path).send({
            note: "Flyers printed",
          })
        ).status,
      ).toBe(201);
      const listed = body<{
        items: { note: string; author: { id: string } | null }[];
        total: number;
      }>(await as(promotionManager, "get", path));
      expect(listed.total).toBe(2);
      expect(listed.items.map((item) => item.note)).toEqual([
        "Flyers printed",
        "Venue confirmed",
      ]);
      expect(listed.items[0]?.author?.id).toBe(promotionManager.id);
    });

    it("refuses blank notes and refuses to let the entries change", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/updates`;
      expect(
        (await as(promotionManager, "post", path).send({ note: "  " })).status,
      ).toBe(400);
      await as(promotionManager, "post", path).send({ note: "Original" });
      const [entry] = await prisma.campaignUpdate.findMany({
        where: { campaignId: campaign.id },
      });
      await expect(
        prisma.campaignUpdate.update({
          where: { id: entry!.id },
          data: { note: "Edited" },
        }),
      ).rejects.toThrow(/append-only/);
    });

    it("shows the overseeing Marketing Manager the log but never lets them add to it", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/updates`;
      await as(promotionManager, "post", path).send({ note: "Internal" });
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect(
        (await as(marketingManager, "post", path).send({ note: "Me too" }))
          .status,
      ).toBe(403);
      expect(
        (await as(promotionMember, "post", path).send({ note: "Member" }))
          .status,
      ).toBe(403);
    });
  });

  describe("recorded metrics", () => {
    it("records a figure exactly as given and lists it", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/metrics`;
      const recorded = await as(promotionManager, "post", path).send({
        key: "REACH",
        value: 12500.5,
        recordedOn: "2026-11-01",
        sourceNote: "Platform insights export",
      });
      expect(recorded.status).toBe(201);
      expect(
        body<{ value: string; recordedOn: string; key: string }>(recorded),
      ).toMatchObject({
        value: "12500.50",
        recordedOn: "2026-11-01",
        key: "REACH",
      });
      const listed = body<{ items: { key: string }[]; total: number }>(
        await as(promotionManager, "get", `${path}?key=REACH`),
      );
      expect(listed.total).toBe(1);
    });

    it("accepts only the five agreed keys and a real calendar day", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/metrics`;
      expect(
        (
          await as(promotionManager, "post", path).send({
            key: "CLICKS",
            value: 1,
            recordedOn: "2026-11-01",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await as(promotionManager, "post", path).send({
            key: "OTHER",
            value: 1,
            recordedOn: "2026-02-30",
          })
        ).status,
      ).toBe(400);
    });

    it("refuses negative values and more than two decimals", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/metrics`;
      expect(
        (
          await as(promotionManager, "post", path).send({
            key: "REACH",
            value: -1,
            recordedOn: "2026-11-01",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await as(promotionManager, "post", path).send({
            key: "REACH",
            value: 1.234,
            recordedOn: "2026-11-01",
          })
        ).status,
      ).toBe(400);
    });

    it("keeps metrics append-only and read-only for the overseer", async () => {
      const campaign = await promotionCampaign();
      const path = `/api/v1/campaigns/${campaign.id}/metrics`;
      await as(promotionManager, "post", path).send({
        key: "ATTENDANCE",
        value: 80,
        recordedOn: "2026-11-02",
      });
      expect((await as(marketingManager, "get", path)).status).toBe(200);
      expect(
        (
          await as(marketingManager, "post", path).send({
            key: "REACH",
            value: 1,
            recordedOn: "2026-11-02",
          })
        ).status,
      ).toBe(403);
      const [metric] = await prisma.campaignMetric.findMany({
        where: { campaignId: campaign.id },
      });
      await expect(
        prisma.campaignMetric.update({
          where: { id: metric!.id },
          data: { value: 999 },
        }),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe("campaign files", () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

    async function uploadFile(
      campaignId: string,
      who: Principal,
    ): Promise<string> {
      const intent = await as(
        who,
        "post",
        `/api/v1/campaigns/${campaignId}/files/upload-intents`,
      ).send({
        filename: "brief.pdf",
        mediaType: "application/pdf",
        sizeBytes: pdf.byteLength,
      });
      expect(intent.status).toBe(201);
      const fileId = body<{ id: string; upload: { fields: { key?: string } } }>(
        intent,
      ).id;
      const key = body<{ upload: { fields: { key?: string } } }>(intent).upload
        .fields.key!;
      storage.objects.set(key, {
        bytes: pdf,
        mediaType: "application/pdf",
        sizeBytes: pdf.byteLength,
      });
      const finalized = await as(
        who,
        "post",
        `/api/v1/campaigns/${campaignId}/files/${fileId}/finalize`,
      );
      expect(finalized.status).toBe(200);
      return fileId;
    }

    it("attaches a file for the department and lets the overseer read and download it", async () => {
      const campaign = await promotionCampaign();
      const fileId = await uploadFile(campaign.id, promotionManager);
      const listed = body<{ items: { id: string }[]; total: number }>(
        await as(
          marketingManager,
          "get",
          `/api/v1/campaigns/${campaign.id}/files`,
        ),
      );
      expect(listed.items.map((item) => item.id)).toContain(fileId);
      const download = await as(
        marketingManager,
        "get",
        `/api/v1/campaigns/${campaign.id}/files/${fileId}/download`,
      );
      expect(download.status).toBe(200);
    });

    it("refuses the overseer and team members any upload, finalize or removal", async () => {
      const campaign = await promotionCampaign();
      const fileId = await uploadFile(campaign.id, promotionManager);
      expect(
        (
          await as(
            marketingManager,
            "post",
            `/api/v1/campaigns/${campaign.id}/files/upload-intents`,
          ).send({
            filename: "x.pdf",
            mediaType: "application/pdf",
            sizeBytes: 10,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            marketingManager,
            "delete",
            `/api/v1/campaigns/${campaign.id}/files/${fileId}`,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            promotionMember,
            "delete",
            `/api/v1/campaigns/${campaign.id}/files/${fileId}`,
          )
        ).status,
      ).toBe(403);
    });

    it("removes a file for the department, which then stops being listed", async () => {
      const campaign = await promotionCampaign();
      const fileId = await uploadFile(campaign.id, promotionManager);
      expect(
        (
          await as(
            promotionManager,
            "delete",
            `/api/v1/campaigns/${campaign.id}/files/${fileId}`,
          )
        ).status,
      ).toBe(204);
      const listed = body<{ items: { id: string }[] }>(
        await as(
          promotionManager,
          "get",
          `/api/v1/campaigns/${campaign.id}/files`,
        ),
      );
      expect(listed.items.map((item) => item.id)).not.toContain(fileId);
    });
  });
});
