import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { NotificationsService } from "../src/notifications/notifications.service.js";
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
 * EVE-232: creative requests from Promotion to Production. Covers the
 * lifecycle and who may make each move, the single CREATIVE task created on
 * acceptance (also under a race), read-only oversight, SELF-scope reads,
 * append-only feedback, reference and deliverable files, and notifications.
 */
const PASSWORD = "correct horse battery staple";

interface Principal {
  id: string;
  cookies: string[];
  csrf: string;
}
interface RequestBody {
  id: string;
  status: string;
  title: string;
  task: { id: string; title: string } | null;
  campaign: { id: string; name: string } | null;
  declineReason: string | null;
  requestingDepartment: { id: string; name: string };
  targetDepartment: { id: string; name: string };
  abilities: {
    moves: string[];
    canAddFeedback: boolean;
    canAttach: string[];
    readOnly: boolean;
  };
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

describe("creative requests (EVE-232)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let storage: MemoryStorage;
  let notifications: NotificationsService;
  let promotionId: string;
  let productionId: string;
  let marketingId: string;
  let promotionManager: Principal;
  let promotionMember: Principal;
  let productionManager: Principal;
  let productionMember: Principal;
  let otherProductionMember: Principal;
  let marketingManager: Principal;
  let superAdmin: Principal;
  let promotionCampaignId: string;
  let marketingCampaignId: string;
  let sequence = 0;

  beforeAll(async () => {
    // Keep migration data: the seeded departments and the Promotion ->
    // Marketing oversight link.
    db = await createIsolatedDatabase({ preserveMigrationData: true });
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "creative-requests-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "creative-requests-refresh-token-secret-at-least-32";
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
      { NotificationsService: NotificationsServiceClass },
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/file-management/storage/object-storage.js"),
      import("../src/file-management/file-scanner.js"),
      import("../src/notifications/notifications.service.js"),
    ]);

    const department = async (name: string) =>
      (await prisma.department.findUniqueOrThrow({ where: { name } })).id;
    promotionId = await department("Promotion");
    productionId = await department("Production");
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
    notifications = app.get(NotificationsServiceClass);

    promotionManager = await principal("Department Manager", promotionId);
    promotionMember = await principal("Department Member", promotionId);
    productionManager = await principal("Department Manager", productionId);
    productionMember = await principal("Department Member", productionId);
    otherProductionMember = await principal("Department Member", productionId);
    marketingManager = await principal("Department Manager", marketingId);
    superAdmin = await principal("Super Admin", null);
    for (const [id, managerId] of [
      [promotionId, promotionManager.id],
      [productionId, productionManager.id],
      [marketingId, marketingManager.id],
    ] as const) {
      await prisma.department.update({ where: { id }, data: { managerId } });
    }

    const campaign = async (
      name: string,
      campaignType: "PROMOTION" | "MARKETING",
      departmentId: string,
    ) => {
      const workspace = await prisma.workspace.create({
        data: { kind: "CAMPAIGN" },
      });
      return (
        await prisma.campaign.create({
          data: { name, campaignType, departmentId, workspaceId: workspace.id },
        })
      ).id;
    };
    promotionCampaignId = await campaign(
      "Festival launch",
      "PROMOTION",
      promotionId,
    );
    marketingCampaignId = await campaign(
      "Brand refresh",
      "MARKETING",
      marketingId,
    );
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
    const email = `creative-${++sequence}@example.test`;
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

  function as(who: Principal, method: "get" | "post" | "put", path: string) {
    const agent = request(app.getHttpServer());
    const call = agent[method](path).set("Cookie", who.cookies);
    return method === "get" ? call : call.set("x-csrf-token", who.csrf);
  }

  async function send(
    overrides: Record<string, unknown> = {},
  ): Promise<RequestBody> {
    const response = await as(
      promotionManager,
      "post",
      "/api/v1/creative-requests",
    ).send({
      title: `Poster ${++sequence}`,
      assetType: "POSTER",
      requirements: "A2 portrait, festival palette, logo bottom right.",
      dueAt: "2030-03-01T09:00:00.000Z",
      campaignId: promotionCampaignId,
      ...overrides,
    });
    expect(response.status).toBe(201);
    return body<RequestBody>(response);
  }

  async function move(
    who: Principal,
    id: string,
    action: string,
    payload?: Record<string, unknown>,
  ) {
    return as(who, "post", `/api/v1/creative-requests/${id}/${action}`).send(
      payload ?? {},
    );
  }

  /** Runs the notifications consumer over this request's outbox events. */
  async function deliver(resourceId: string) {
    const events = await prisma.outboxEvent.findMany({
      where: { resourceId },
      orderBy: { occurredAt: "asc" },
    });
    for (const event of events) {
      await notifications.processEvent({
        id: event.id,
        name: event.name,
        version: event.version,
        occurredAt: event.occurredAt,
        actorKind: event.actorKind,
        actorUserId: event.actorUserId,
        correlationId: event.correlationId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        workspaceContext: event.workspaceContext,
        payload: event.payload,
      });
    }
    return prisma.notification.findMany({
      where: { creativeRequestId: resourceId },
      select: { recipientUserId: true, type: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

  async function upload(
    who: Principal,
    id: string,
    kind: "REFERENCE" | "DELIVERABLE",
  ): Promise<{ status: number; fileId?: string }> {
    const intent = await as(
      who,
      "post",
      `/api/v1/creative-requests/${id}/files/upload-intents`,
    ).send({
      filename: "brief.pdf",
      mediaType: "application/pdf",
      sizeBytes: pdf.byteLength,
      kind,
    });
    if (intent.status !== 201) return { status: intent.status };
    const created = body<{
      id: string;
      upload: { fields: { key?: string } };
    }>(intent);
    storage.objects.set(created.upload.fields.key!, {
      bytes: pdf,
      mediaType: "application/pdf",
      sizeBytes: pdf.byteLength,
    });
    const finalized = await as(
      who,
      "post",
      `/api/v1/creative-requests/${id}/files/${created.id}/finalize`,
    ).send({ kind });
    return { status: finalized.status, fileId: created.id };
  }

  describe("sending a request", () => {
    it("lets the Promotional Manager send a request to Production", async () => {
      const created = await send();
      expect(created.status).toBe("SUBMITTED");
      expect(created.requestingDepartment.name).toBe("Promotion");
      expect(created.targetDepartment.name).toBe("Production");
      expect(created.campaign?.id).toBe(promotionCampaignId);
      expect(created.task).toBeNull();
      expect(created.abilities.moves).toEqual(["CANCELLED"]);
      expect(created.abilities.canAttach).toEqual(["REFERENCE"]);
    });

    it("refuses a team member, another department's manager, and blank input", async () => {
      const payload = {
        title: "Banner",
        assetType: "BANNER",
        requirements: "3m x 1m.",
      };
      for (const who of [
        promotionMember,
        productionManager,
        marketingManager,
      ]) {
        const response = await as(
          who,
          "post",
          "/api/v1/creative-requests",
        ).send(payload);
        expect(response.status).toBe(403);
      }
      const blank = await as(
        promotionManager,
        "post",
        "/api/v1/creative-requests",
      ).send({ ...payload, requirements: "   " });
      expect(blank.status).toBe(400);
    });

    it("only links a campaign of the requesting department", async () => {
      const response = await as(
        promotionManager,
        "post",
        "/api/v1/creative-requests",
      ).send({
        title: "Flyer",
        assetType: "FLYER",
        requirements: "A5.",
        campaignId: marketingCampaignId,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe(
        "CREATIVE_REQUEST_CAMPAIGN_NOT_FOUND",
      );
    });

    it("lets Super Admin send one on Promotion's behalf", async () => {
      const response = await as(
        superAdmin,
        "post",
        "/api/v1/creative-requests",
      ).send({
        title: "Video teaser",
        assetType: "VIDEO",
        requirements: "30s.",
      });
      expect(response.status).toBe(201);
      expect(body<RequestBody>(response).requestingDepartment.id).toBe(
        promotionId,
      );
    });
  });

  describe("accepting", () => {
    it("creates exactly one CREATIVE task in Production, linked to the campaign", async () => {
      const created = await send();
      const accepted = await move(productionManager, created.id, "accept");
      expect(accepted.status).toBe(200);
      const result = body<RequestBody>(accepted);
      expect(result.status).toBe("ACCEPTED");
      expect(result.task).not.toBeNull();
      const tasks = await prisma.task.findMany({
        where: { id: result.task!.id },
        select: {
          type: true,
          departmentId: true,
          relatedCampaignId: true,
          createdById: true,
          dueAt: true,
        },
      });
      expect(tasks).toEqual([
        {
          type: "CREATIVE",
          departmentId: productionId,
          relatedCampaignId: promotionCampaignId,
          createdById: productionManager.id,
          dueAt: new Date("2030-03-01T09:00:00.000Z"),
        },
      ]);
    });

    it("lets only one of two concurrent accepts win, and creates one task", async () => {
      const created = await send();
      const before = await prisma.task.count({ where: { type: "CREATIVE" } });
      const [first, second] = await Promise.all([
        move(productionManager, created.id, "accept"),
        move(productionManager, created.id, "accept"),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(await prisma.task.count({ where: { type: "CREATIVE" } })).toBe(
        before + 1,
      );
    });

    it("refuses the requesting side and an unrelated department", async () => {
      const created = await send();
      expect((await move(promotionManager, created.id, "accept")).status).toBe(
        403,
      );
      expect((await move(marketingManager, created.id, "accept")).status).toBe(
        403,
      );
      expect((await move(productionManager, created.id, "cancel")).status).toBe(
        403,
      );
    });
  });

  describe("the rest of the lifecycle", () => {
    it("runs accept, start, deliver, changes, deliver, approve", async () => {
      const created = await send();
      expect((await move(productionManager, created.id, "accept")).status).toBe(
        200,
      );
      expect((await move(productionManager, created.id, "start")).status).toBe(
        200,
      );
      expect(
        (await upload(productionManager, created.id, "DELIVERABLE")).status,
      ).toBe(200);
      expect(
        (await move(productionManager, created.id, "deliver")).status,
      ).toBe(200);

      // Asking for changes needs a note; only the requesting side reviews.
      const noNote = await move(promotionManager, created.id, "review", {
        outcome: "CHANGES_REQUESTED",
      });
      expect(noNote.status).toBe(400);
      expect(body<ProblemBody>(noNote).code).toBe(
        "CREATIVE_REQUEST_NOTE_REQUIRED",
      );
      expect(
        (
          await move(productionManager, created.id, "review", {
            outcome: "APPROVED",
          })
        ).status,
      ).toBe(403);
      const changes = await move(promotionManager, created.id, "review", {
        outcome: "CHANGES_REQUESTED",
        note: "Make the logo larger.",
      });
      expect(body<RequestBody>(changes).status).toBe("CHANGES_REQUESTED");
      const feedback = body<{ items: { note: string }[] }>(
        await as(
          productionManager,
          "get",
          `/api/v1/creative-requests/${created.id}/feedback`,
        ),
      );
      expect(feedback.items.map((item) => item.note)).toEqual([
        "Make the logo larger.",
      ]);

      expect((await move(productionManager, created.id, "start")).status).toBe(
        200,
      );
      expect(
        (await move(productionManager, created.id, "deliver")).status,
      ).toBe(200);
      const approved = await move(promotionManager, created.id, "review", {
        outcome: "APPROVED",
      });
      expect(body<RequestBody>(approved).status).toBe("APPROVED");

      const after = await move(productionManager, created.id, "start");
      expect(after.status).toBe(409);
      expect(body<ProblemBody>(after).code).toBe(
        "CREATIVE_REQUEST_INVALID_TRANSITION",
      );
    });

    it("refuses delivery without a deliverable file (EVE-233)", async () => {
      const created = await send();
      await move(productionManager, created.id, "accept");
      await move(productionManager, created.id, "start");
      // A reference from the requester does not count as a deliverable.
      expect(
        (await upload(promotionManager, created.id, "REFERENCE")).status,
      ).toBe(200);
      const refused = await move(productionManager, created.id, "deliver");
      expect(refused.status).toBe(409);
      expect(body<ProblemBody>(refused).code).toBe(
        "CREATIVE_REQUEST_DELIVERABLE_REQUIRED",
      );
      expect(
        (
          await prisma.creativeRequest.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).status,
      ).toBe("IN_PROGRESS");
      expect(
        (await upload(productionManager, created.id, "DELIVERABLE")).status,
      ).toBe(200);
      const delivered = await move(productionManager, created.id, "deliver");
      expect(body<RequestBody>(delivered).status).toBe("DELIVERED");
    });

    it("declines with a reason, and the requester can cancel before acceptance", async () => {
      const declined = await send();
      expect(
        (await move(productionManager, declined.id, "decline", { reason: " " }))
          .status,
      ).toBe(400);
      const result = await move(productionManager, declined.id, "decline", {
        reason: "No capacity this month.",
      });
      expect(body<RequestBody>(result).declineReason).toBe(
        "No capacity this month.",
      );

      const cancelled = await send();
      const response = await move(promotionManager, cancelled.id, "cancel");
      expect(body<RequestBody>(response).status).toBe("CANCELLED");
      expect(
        (await move(productionManager, cancelled.id, "accept")).status,
      ).toBe(409);
    });

    it("keeps the decline reason consistent at the database", async () => {
      const created = await send();
      await expect(
        prisma.creativeRequest.update({
          where: { id: created.id },
          data: { status: "DECLINED" },
        }),
      ).rejects.toThrow(/creative_requests_decline_reason/);
    });
  });

  describe("who can read", () => {
    it("gives the Marketing Manager read-only oversight", async () => {
      const created = await send();
      const read = await as(
        marketingManager,
        "get",
        `/api/v1/creative-requests/${created.id}`,
      );
      expect(read.status).toBe(200);
      expect(body<RequestBody>(read).abilities).toEqual({
        moves: [],
        canAddFeedback: false,
        canAttach: [],
        readOnly: true,
      });
      const listed = body<{ items: { id: string }[] }>(
        await as(marketingManager, "get", "/api/v1/creative-requests"),
      );
      expect(listed.items.map((item) => item.id)).toContain(created.id);
      expect(
        (
          await as(
            marketingManager,
            "post",
            `/api/v1/creative-requests/${created.id}/feedback`,
          ).send({ note: "Looks good" })
        ).status,
      ).toBe(403);
      expect((await move(marketingManager, created.id, "cancel")).status).toBe(
        403,
      );
    });

    it("lets a Production member read only requests whose task they work on", async () => {
      const created = await send();
      const accepted = body<RequestBody>(
        await move(productionManager, created.id, "accept"),
      );
      const path = `/api/v1/creative-requests/${created.id}`;
      expect((await as(productionMember, "get", path)).status).toBe(403);
      const assign = await as(
        productionManager,
        "put",
        `/api/v1/tasks/${accepted.task!.id}/assignees/${productionMember.id}`,
      );
      expect(assign.status).toBe(200);
      expect((await as(productionMember, "get", path)).status).toBe(200);
      expect((await as(otherProductionMember, "get", path)).status).toBe(403);
      const listed = body<{ items: { id: string }[] }>(
        await as(productionMember, "get", "/api/v1/creative-requests"),
      );
      expect(listed.items.map((item) => item.id)).toEqual([created.id]);
      // Promotion members did not send it, so they cannot read it either.
      expect((await as(promotionMember, "get", path)).status).toBe(403);
    });

    it("filters by direction for each side", async () => {
      const created = await send();
      const sent = body<{ items: { id: string }[] }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/creative-requests?direction=SENT",
        ),
      );
      expect(sent.items.map((item) => item.id)).toContain(created.id);
      const received = body<{ items: { id: string }[] }>(
        await as(
          promotionManager,
          "get",
          "/api/v1/creative-requests?direction=RECEIVED",
        ),
      );
      expect(received.items).toEqual([]);
      const inbox = body<{ items: { id: string }[] }>(
        await as(
          productionManager,
          "get",
          "/api/v1/creative-requests?direction=RECEIVED",
        ),
      );
      expect(inbox.items.map((item) => item.id)).toContain(created.id);
    });
  });

  describe("feedback", () => {
    it("lets either side add feedback, and keeps it append-only", async () => {
      const created = await send();
      for (const who of [promotionManager, productionManager]) {
        const response = await as(
          who,
          "post",
          `/api/v1/creative-requests/${created.id}/feedback`,
        ).send({ note: `Note from ${who.id}` });
        expect(response.status).toBe(201);
      }
      const row = await prisma.creativeRequestFeedback.findFirstOrThrow({
        where: { creativeRequestId: created.id },
      });
      await expect(
        prisma.creativeRequestFeedback.update({
          where: { id: row.id },
          data: { note: "edited" },
        }),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe("files", () => {
    it("takes references from the requester and deliverables from Production", async () => {
      const created = await send();
      const reference = await upload(promotionManager, created.id, "REFERENCE");
      expect(reference.status).toBe(200);
      expect(
        (await upload(productionManager, created.id, "REFERENCE")).status,
      ).toBe(403);
      // No deliverables before the work is accepted.
      const early = await upload(productionManager, created.id, "DELIVERABLE");
      expect(early.status).toBe(409);

      await move(productionManager, created.id, "accept");
      await move(productionManager, created.id, "start");
      const deliverable = await upload(
        productionManager,
        created.id,
        "DELIVERABLE",
      );
      expect(deliverable.status).toBe(200);
      expect(
        (await upload(promotionManager, created.id, "DELIVERABLE")).status,
      ).toBe(403);

      const listed = body<{ items: { id: string; kind: string }[] }>(
        await as(
          marketingManager,
          "get",
          `/api/v1/creative-requests/${created.id}/files`,
        ),
      );
      expect(listed.items.map((item) => [item.id, item.kind]).sort()).toEqual(
        [
          [reference.fileId, "REFERENCE"],
          [deliverable.fileId, "DELIVERABLE"],
        ].sort(),
      );
      const download = await as(
        marketingManager,
        "get",
        `/api/v1/creative-requests/${created.id}/files/${deliverable.fileId}/download`,
      );
      expect(download.status).toBe(200);
      expect(
        (await upload(marketingManager, created.id, "REFERENCE")).status,
      ).toBe(403);
    });
  });

  describe("notifications", () => {
    it("notifies Production of a new request and the requester of each answer", async () => {
      const created = await send();
      await move(productionManager, created.id, "accept");
      await move(productionManager, created.id, "start");
      await upload(productionManager, created.id, "DELIVERABLE");
      await move(productionManager, created.id, "deliver");
      await move(promotionManager, created.id, "review", {
        outcome: "APPROVED",
      });
      const sent = await deliver(created.id);
      expect(sent).toEqual([
        {
          recipientUserId: productionManager.id,
          type: "CREATIVE_REQUEST_SUBMITTED",
        },
        {
          recipientUserId: promotionManager.id,
          type: "CREATIVE_REQUEST_ACCEPTED",
        },
        {
          recipientUserId: promotionManager.id,
          type: "CREATIVE_REQUEST_DELIVERED",
        },
        {
          recipientUserId: productionManager.id,
          type: "CREATIVE_REQUEST_REVIEWED",
        },
      ]);
    });

    it("notifies the requester of a decline", async () => {
      const created = await send();
      await move(productionManager, created.id, "decline", {
        reason: "Out of scope.",
      });
      const sent = await deliver(created.id);
      expect(sent.map((item) => item.type)).toEqual([
        "CREATIVE_REQUEST_SUBMITTED",
        "CREATIVE_REQUEST_DECLINED",
      ]);
    });
  });
});
