import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import { FILE_OBJECT_STORAGE } from "../src/file-management/storage/object-storage.js";
import { FILE_SCANNER } from "../src/file-management/file-scanner.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const UUID = "00000000-0000-0000-0000-000000000000";
/** A valid 1x1 PNG, used as the profile photo bytes. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const day = (n: number) => new Date(Date.UTC(2027, 7, n, 10));

interface Principal {
  cookies: string[];
  csrfToken: string;
  userId: string;
}

interface ProblemBody {
  code: string;
  errors?: unknown[];
}

interface StoredObject {
  bytes: Buffer;
  sizeBytes: number;
}

class InMemoryObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  createUploadGrant(input: { key: string; mediaType: string }) {
    return {
      fields: { "Content-Type": input.mediaType, key: input.key },
      url: "https://storage.test/upload",
    };
  }
  readObject(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
  createDownloadGrant(input: { key: string }) {
    return {
      expiresAt: new Date("2030-01-01T00:05:00.000Z"),
      url: `https://storage.test/download/${encodeURIComponent(input.key)}`,
    };
  }
  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const header = setCookie.find((entry) => entry.startsWith(`${name}=`));
  const value = header?.slice(name.length + 1).split(";")[0];
  if (!value) throw new Error(`cookie ${name} not present`);
  return value;
}

/**
 * Integrity of talent assignments against the rest of the platform: parents
 * with assignment history cannot be deleted; legacy and production routes use
 * the one assignment service; the list and summary are accurate; and profile
 * photos are validated, scanned, and attached.
 */
describe("talent integrity", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  const storage = new InMemoryObjectStorage();

  let superAdmin: Principal;
  let admin: Principal;
  let productionManager: Principal;
  let marketingManager: Principal;
  let member: Principal;
  let talentManagerId: string;
  let productionDeptId: string;
  let marketingDeptId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "talent-integrity-access-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "talent-integrity-refresh-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
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
    const credentialHash = await new hasherModule.PasswordHasher().hash(
      PASSWORD,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(storage)
      .overrideProvider(FILE_SCANNER)
      .useValue({ scan: () => Promise.resolve("clean") })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function seedUser(
      email: string,
      role: string,
      departmentId?: string,
    ): Promise<Principal> {
      const user = await prisma.user.create({
        data: {
          email,
          firstName: email.split("@")[0] ?? "Test",
          credential: { create: { passwordHash: credentialHash } },
          departmentId: departmentId ?? null,
        },
      });
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, roleId: roleRow.id },
      });
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return {
        cookies,
        csrfToken: cookieValue(cookies, "csrf_token"),
        userId: user.id,
      };
    }

    productionDeptId = (
      await prisma.department.upsert({
        where: { name: "Production" },
        update: {},
        create: { name: "Production" },
      })
    ).id;
    marketingDeptId = (
      await prisma.department.upsert({
        where: { name: "Marketing" },
        update: {},
        create: { name: "Marketing" },
      })
    ).id;
    superAdmin = await seedUser("super-admin@integrity.test", "Super Admin");
    admin = await seedUser("admin@integrity.test", "Admin", marketingDeptId);
    productionManager = await seedUser(
      "prod-manager@integrity.test",
      "Department Manager",
      productionDeptId,
    );
    member = await seedUser("member@integrity.test", "Department Member");
    marketingManager = await seedUser(
      "mkt-manager@integrity.test",
      "Department Manager",
      marketingDeptId,
    );
    talentManagerId = (
      await seedUser("talent-manager@integrity.test", "Super Admin")
    ).userId;
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

  async function createTalent(
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const response = await as(superAdmin, "post", "/api/v1/talents").send({
      fullName: `Talent ${Math.random().toString(36).slice(2)}`,
      type: "MUSICIAN",
      managerId: talentManagerId,
      email: "contact@integrity.test",
      ...extra,
    });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  async function eventRow(
    opts: {
      name?: string;
      departmentId?: string | null;
      startAt?: Date;
      endAt?: Date;
    } = {},
  ) {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name: opts.name ?? `Event ${Math.random().toString(36).slice(2)}`,
        eventType: "CONCERT",
        departmentId: opts.departmentId ?? null,
        startAt: opts.startAt ?? day(1),
        endAt: opts.endAt ?? day(2),
      },
    });
    return event.id;
  }

  async function productionRow(opts: { departmentId: string | null }) {
    const workspace = await prisma.workspace.create({
      data: { kind: "PRODUCTION" },
    });
    const production = await prisma.production.create({
      data: {
        workspaceId: workspace.id,
        name: `Production ${Math.random().toString(36).slice(2)}`,
        productionType: "STAGE",
        departmentId: opts.departmentId,
        startAt: day(3),
        endAt: day(4),
      },
    });
    return production.id;
  }

  async function promotionRow(opts: { departmentId: string | null }) {
    const workspace = await prisma.workspace.create({
      data: { kind: "CAMPAIGN" },
    });
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: workspace.id,
        name: `Campaign ${Math.random().toString(36).slice(2)}`,
        campaignType: "PROMOTION",
        departmentId: opts.departmentId,
      },
    });
    const activity = await prisma.campaignActivity.create({
      data: {
        campaignId: campaign.id,
        name: `Promotion ${Math.random().toString(36).slice(2)}`,
        startAt: day(5),
        endAt: day(6),
      },
    });
    await prisma.promotionActivity.create({
      data: {
        campaignActivityId: activity.id,
        campaignId: campaign.id,
        channel: "SOCIAL_MEDIA",
      },
    });
    return { campaignId: campaign.id, activityId: activity.id };
  }

  async function assignToEvent(
    principal: Principal,
    talentId: string,
    eventId: string,
    extra: Record<string, unknown> = {},
  ) {
    return as(
      principal,
      "post",
      `/api/v1/talents/${talentId}/assignments`,
    ).send({
      kind: "EVENT",
      workId: eventId,
      role: "Headliner",
      ...extra,
    });
  }

  describe("parents with assignment history are archived, never deleted with it", () => {
    it("archives an event that has talent assignment history, keeps the history, and hides the event", async () => {
      const talent = await createTalent();
      const eventId = await eventRow({ name: "Kept event" });
      expect((await assignToEvent(superAdmin, talent.id, eventId)).status).toBe(
        201,
      );

      const archived = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${eventId}`,
      );
      expect(archived.status).toBe(204);
      expect(
        (await prisma.event.findUnique({ where: { id: eventId } }))?.archivedAt,
      ).toBeInstanceOf(Date);
      expect(
        await prisma.eventTalent.count({
          where: { eventId, talentId: talent.id },
        }),
      ).toBe(1);
      expect(
        (await as(superAdmin, "get", `/api/v1/events/${eventId}`)).status,
      ).toBe(404);
      expect(
        (await as(superAdmin, "delete", `/api/v1/events/${eventId}`)).status,
      ).toBe(404);
      expect(
        JSON.stringify((await as(superAdmin, "get", "/api/v1/events")).body),
      ).not.toContain(eventId);
    });

    it("refuses new assignments to an archived event and leaves it out of the assignable works", async () => {
      const talent = await createTalent();
      const eventId = await eventRow({ name: "Archived event" });
      expect((await assignToEvent(superAdmin, talent.id, eventId)).status).toBe(
        201,
      );
      await as(superAdmin, "delete", `/api/v1/events/${eventId}`);

      const other = await createTalent();
      const refused = await assignToEvent(superAdmin, other.id, eventId);
      expect(refused.status).toBe(404);
      expect((refused.body as ProblemBody).code).toBe("TALENT_WORK_NOT_FOUND");

      const works = await as(
        superAdmin,
        "get",
        "/api/v1/talent-assignments/works?kind=EVENT",
      );
      expect(JSON.stringify(works.body)).not.toContain(eventId);
    });

    it("refuses at the database level as well, so no other path can drop the history", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      expect((await assignToEvent(superAdmin, talent.id, eventId)).status).toBe(
        201,
      );
      await expect(
        prisma.event.delete({ where: { id: eventId } }),
      ).rejects.toMatchObject({ code: "P2003" });
    });

    it("keeps the work name recorded at assignment, even after the work is renamed", async () => {
      const talent = await createTalent();
      const eventId = await eventRow({ name: "Original name" });
      expect((await assignToEvent(superAdmin, talent.id, eventId)).status).toBe(
        201,
      );
      await prisma.event.update({
        where: { id: eventId },
        data: { name: "Renamed later" },
      });
      const rows = (
        await as(superAdmin, "get", `/api/v1/talents/${talent.id}/assignments`)
      ).body as { workName: string }[];
      expect(rows[0]?.workName).toBe("Original name");
    });

    it("archives a production that has talent assignment history and hides it", async () => {
      const talent = await createTalent();
      const productionId = await productionRow({
        departmentId: productionDeptId,
      });
      const assigned = await as(
        superAdmin,
        "put",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      ).send({ role: "Host" });
      expect(assigned.status).toBe(200);

      expect(
        (await as(superAdmin, "delete", `/api/v1/productions/${productionId}`))
          .status,
      ).toBe(204);
      expect(
        (await prisma.production.findUnique({ where: { id: productionId } }))
          ?.archivedAt,
      ).toBeInstanceOf(Date);
      expect(
        await prisma.productionTalent.count({
          where: { productionId, talentId: talent.id },
        }),
      ).toBe(1);
      expect(
        (await as(superAdmin, "get", `/api/v1/productions/${productionId}`))
          .status,
      ).toBe(404);
    });

    it("archives a campaign that has talent assignment history and hides it with its activities", async () => {
      const talent = await createTalent();
      const promo = await promotionRow({ departmentId: marketingDeptId });
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}/talents`,
          ).send({ talentId: talent.id, role: "Ambassador" })
        ).status,
      ).toBe(201);

      expect(
        (
          await as(
            superAdmin,
            "delete",
            `/api/v1/campaigns/${promo.campaignId}`,
          )
        ).status,
      ).toBe(204);
      expect(
        (await prisma.campaign.findUnique({ where: { id: promo.campaignId } }))
          ?.archivedAt,
      ).toBeInstanceOf(Date);
      expect(
        (await as(superAdmin, "get", `/api/v1/campaigns/${promo.campaignId}`))
          .status,
      ).toBe(404);
      expect(
        await prisma.promotionActivityTalent.count({
          where: { campaignActivityId: promo.activityId },
        }),
      ).toBe(1);
    });

    it("archives a promotional activity that has talent assignment history and keeps its campaign", async () => {
      const talent = await createTalent();
      const promo = await promotionRow({ departmentId: marketingDeptId });
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}/talents`,
          ).send({ talentId: talent.id, role: "Ambassador" })
        ).status,
      ).toBe(201);

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}`,
      );
      expect(removed.status).toBe(204);
      expect(
        (
          await prisma.campaignActivity.findUnique({
            where: { id: promo.activityId },
          })
        )?.archivedAt,
      ).toBeInstanceOf(Date);
      expect(
        (await prisma.campaign.findUnique({ where: { id: promo.campaignId } }))
          ?.archivedAt,
      ).toBeNull();
      expect(
        (
          await as(
            superAdmin,
            "get",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}`,
          )
        ).status,
      ).toBe(404);
      expect(
        await prisma.promotionActivityTalent.count({
          where: { campaignActivityId: promo.activityId },
        }),
      ).toBe(1);
    });

    it("still deletes an event that never had talent assignments", async () => {
      const eventId = await eventRow();
      expect(
        (await as(superAdmin, "delete", `/api/v1/events/${eventId}`)).status,
      ).toBe(204);
      expect(
        await prisma.event.findUnique({ where: { id: eventId } }),
      ).toBeNull();
    });
  });

  describe("archiving a work item cancels its active assignments in the same write", () => {
    const ARCHIVED = "Work item archived.";

    it("cancels an event's active assignment with the reason, actor and history, and keeps the row", async () => {
      const active = await createTalent({ fullName: "Active Artist" });
      const earlier = await createTalent({ fullName: "Earlier Artist" });
      const eventId = await eventRow({ name: "Spring Gala" });
      expect((await assignToEvent(superAdmin, active.id, eventId)).status).toBe(
        201,
      );
      expect(
        (await assignToEvent(superAdmin, earlier.id, eventId)).status,
      ).toBe(201);
      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${earlier.id}/assignments/EVENT/${(await prisma.eventTalent.findFirstOrThrow({ where: { eventId, talentId: earlier.id } })).id}/transition`,
      ).send({ status: "CANCELLED", reason: "Moved to another show" });
      const before = await prisma.eventTalent.findFirstOrThrow({
        where: { eventId, talentId: active.id },
      });

      expect(
        (await as(superAdmin, "delete", `/api/v1/events/${eventId}`)).status,
      ).toBe(204);

      const after = await prisma.eventTalent.findFirstOrThrow({
        where: { id: before.id },
      });
      expect(after.status).toBe("CANCELLED");
      expect(after.cancelReason).toBe(ARCHIVED);
      expect(after.cancelledById).toBe(superAdmin.userId);
      expect(after.cancelledAt).toBeInstanceOf(Date);
      expect(after.workName).toBe("Spring Gala");
      expect(after.activeSlot).toBeNull();
      expect(await prisma.eventTalent.count({ where: { eventId } })).toBe(2);
      // The earlier cancellation keeps its own reason; nothing rewrote it.
      const kept = await prisma.eventTalent.findFirstOrThrow({
        where: { eventId, talentId: earlier.id },
      });
      expect(kept.cancelReason).toBe("Moved to another show");

      const history = await prisma.talentActivity.findMany({
        where: { talentId: active.id, type: "ASSIGNMENT_CANCELLED" },
      });
      expect(history).toHaveLength(1);
      expect(history[0]!.details).toMatchObject({
        reason: ARCHIVED,
        workName: "Spring Gala",
      });
      expect(history[0]!.actorId).toBe(superAdmin.userId);

      const audit = await prisma.auditRecord.count({
        where: { action: "talent.assignment.cancelled", resourceId: active.id },
      });
      expect(audit).toBe(1);

      const notices = await prisma.outboxEvent.findMany({
        where: { name: "talent.assignment_cancelled", resourceId: active.id },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0]!.payload).toMatchObject({
        workName: "Spring Gala",
        reason: ARCHIVED,
      });

      const summary = (
        await as(superAdmin, "get", `/api/v1/talents/${active.id}`)
      ).body as {
        activeAssignmentCount: number;
        currentAssignment: unknown;
      };
      expect(summary.activeAssignmentCount).toBe(0);
      expect(summary.currentAssignment).toBeNull();
    });

    it("cancels production and promotional activity assignments when their parents are archived", async () => {
      const talent = await createTalent({ fullName: "Presenter Two" });
      const productionId = await productionRow({
        departmentId: productionDeptId,
      });
      expect(
        (
          await as(
            superAdmin,
            "put",
            `/api/v1/productions/${productionId}/talents/${talent.id}`,
          ).send({ role: "Host" })
        ).status,
      ).toBe(200);
      expect(
        (await as(superAdmin, "delete", `/api/v1/productions/${productionId}`))
          .status,
      ).toBe(204);
      const production = await prisma.productionTalent.findFirstOrThrow({
        where: { productionId, talentId: talent.id },
      });
      expect(production.status).toBe("CANCELLED");
      expect(production.cancelReason).toBe(ARCHIVED);

      const promo = await promotionRow({ departmentId: marketingDeptId });
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}/talents`,
          ).send({ talentId: talent.id, role: "Ambassador" })
        ).status,
      ).toBe(201);
      expect(
        (
          await as(
            superAdmin,
            "delete",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}`,
          )
        ).status,
      ).toBe(204);
      const promotion = await prisma.promotionActivityTalent.findFirstOrThrow({
        where: { campaignActivityId: promo.activityId, talentId: talent.id },
      });
      expect(promotion.status).toBe("CANCELLED");
      expect(promotion.cancelReason).toBe(ARCHIVED);
      expect(promotion.workName).toBeTruthy();

      const notices = await prisma.outboxEvent.findMany({
        where: { name: "talent.assignment_cancelled", resourceId: talent.id },
      });
      expect(notices.length).toBeGreaterThanOrEqual(2);
    });

    it("cancels a whole campaign's promotional assignments in one archive", async () => {
      const talent = await createTalent({ fullName: "Campaign Presenter" });
      const promo = await promotionRow({ departmentId: marketingDeptId });
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/promotion/campaigns/${promo.campaignId}/activities/${promo.activityId}/talents`,
          ).send({ talentId: talent.id, role: "Ambassador" })
        ).status,
      ).toBe(201);

      expect(
        (
          await as(
            superAdmin,
            "delete",
            `/api/v1/campaigns/${promo.campaignId}`,
          )
        ).status,
      ).toBe(204);

      const row = await prisma.promotionActivityTalent.findFirstOrThrow({
        where: { campaignActivityId: promo.activityId, talentId: talent.id },
      });
      expect(row.status).toBe("CANCELLED");
      expect(row.cancelReason).toBe(ARCHIVED);
      expect(
        await prisma.promotionActivityTalent.count({
          where: { campaignActivityId: promo.activityId },
        }),
      ).toBe(1);
    });
  });

  describe("legacy and production routes use the one assignment service", () => {
    it("applies conflicts, overrides, and history to the legacy event route", async () => {
      const talent = await createTalent();
      const first = await eventRow({ startAt: day(10), endAt: day(12) });
      const second = await eventRow({ startAt: day(11), endAt: day(13) });
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/talents/${talent.id}/event-assignments`,
          ).send({ eventId: first, role: "Lead" })
        ).status,
      ).toBe(201);

      const refused = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/event-assignments`,
      ).send({ eventId: second, role: "Support" });
      expect(refused.status).toBe(409);
      expect((refused.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_CONFLICT",
      );
      expect(Array.isArray((refused.body as ProblemBody).errors)).toBe(true);

      const overridden = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/event-assignments`,
      ).send({
        eventId: second,
        role: "Support",
        acknowledgeConflicts: true,
        overrideReason: "Confirmed",
      });
      expect(overridden.status).toBe(201);
      expect(
        await prisma.talentConflictOverride.count({
          where: { talentId: talent.id },
        }),
      ).toBe(1);
      expect(
        await prisma.talentActivity.count({
          where: { talentId: talent.id, type: "ASSIGNMENT_CREATED" },
        }),
      ).toBe(2);
      expect(
        await prisma.auditRecord.count({
          where: { action: "talent.assignment.created", resourceId: talent.id },
        }),
      ).toBe(2);
    });

    it("cancels through the legacy transition route only with a reason, and keeps the row", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      const created = (
        await as(
          superAdmin,
          "post",
          `/api/v1/talents/${talent.id}/event-assignments`,
        ).send({ eventId, role: "Lead" })
      ).body as {
        eventAssignments: { id: string }[];
      };
      const assignmentId = created.eventAssignments[0]!.id;
      const noReason = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/event-assignments/${assignmentId}/transition`,
      ).send({ status: "CANCELLED" });
      expect(noReason.status).toBe(400);
      const cancelled = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/event-assignments/${assignmentId}/transition`,
      ).send({
        status: "CANCELLED",
        reason: "Withdrew",
      });
      expect(cancelled.status).toBe(200);
      const row = await prisma.eventTalent.findUniqueOrThrow({
        where: { id: assignmentId },
      });
      expect(row).toMatchObject({
        status: "CANCELLED",
        cancelReason: "Withdrew",
      });
    });

    it("lets a Production Manager assign talent to a production in their department through the production route, and cancels on removal", async () => {
      const talent = await createTalent();
      const productionId = await productionRow({
        departmentId: productionDeptId,
      });
      const assigned = await as(
        productionManager,
        "put",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      ).send({ role: "Stage manager" });
      expect(assigned.status).toBe(200);
      expect(
        await prisma.productionTalent.count({
          where: { productionId, talentId: talent.id, status: "ASSIGNED" },
        }),
      ).toBe(1);
      const removed = await as(
        productionManager,
        "delete",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      );
      expect(removed.status).toBe(200);
      const rows = await prisma.productionTalent.findMany({
        where: { productionId, talentId: talent.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "CANCELLED",
        cancelledById: productionManager.userId,
      });
    });

    it("refuses a production route assignment that conflicts, rather than overriding it silently", async () => {
      const talent = await createTalent();
      // The production window is day 3 to day 4; an assignment in that window clashes with it.
      const busy = await eventRow({ startAt: day(3), endAt: day(4) });
      expect((await assignToEvent(superAdmin, talent.id, busy)).status).toBe(
        201,
      );
      const productionId = await productionRow({
        departmentId: productionDeptId,
      });
      const refused = await as(
        superAdmin,
        "put",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      ).send({ role: "Host" });
      expect(refused.status).toBe(409);
      expect((refused.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_CONFLICT",
      );
    });
  });

  describe("talent list and summary", () => {
    it("sorts by name, newest, and availability, and filters by assignment", async () => {
      const alpha = await createTalent({ fullName: "Alpha list" });
      const beta = await createTalent({ fullName: "Beta list" });
      const eventId = await eventRow();
      expect((await assignToEvent(superAdmin, beta.id, eventId)).status).toBe(
        201,
      );

      const byName = (
        await as(superAdmin, "get", "/api/v1/talents?sort=name&pageSize=100")
      ).body as { items: { id: string; fullName: string }[] };
      const names = byName.items.map((item) => item.fullName);
      expect(names.indexOf("Alpha list")).toBeLessThan(
        names.indexOf("Beta list"),
      );

      const newest = (
        await as(superAdmin, "get", "/api/v1/talents?sort=newest&pageSize=100")
      ).body as { items: { id: string }[] };
      expect(
        newest.items.findIndex((item) => item.id === beta.id),
      ).toBeLessThan(newest.items.findIndex((item) => item.id === alpha.id));

      const assigned = (
        await as(
          superAdmin,
          "get",
          "/api/v1/talents?assignment=assigned&pageSize=100",
        )
      ).body as {
        items: {
          id: string;
          activeAssignmentCount: number;
          currentAssignment: { workName: string } | null;
        }[];
      };
      expect(assigned.items.map((item) => item.id)).toContain(beta.id);
      expect(assigned.items.map((item) => item.id)).not.toContain(alpha.id);
      const betaRow = assigned.items.find((item) => item.id === beta.id)!;
      expect(betaRow.activeAssignmentCount).toBe(1);
      expect(betaRow.currentAssignment).toMatchObject({ kind: "EVENT" });

      const unassigned = (
        await as(
          superAdmin,
          "get",
          "/api/v1/talents?assignment=unassigned&pageSize=100",
        )
      ).body as { items: { id: string }[] };
      expect(unassigned.items.map((item) => item.id)).toContain(alpha.id);
      expect(unassigned.items.map((item) => item.id)).not.toContain(beta.id);
    });

    it("returns directory summary counts computed from the data", async () => {
      const before = (await as(superAdmin, "get", "/api/v1/talents/summary"))
        .body as {
        total: number;
        assignedTalents: number;
        activeAssignments: number;
        byAvailability: Record<string, number>;
      };
      const talent = await createTalent();
      const eventId = await eventRow();
      expect((await assignToEvent(superAdmin, talent.id, eventId)).status).toBe(
        201,
      );
      const after = (await as(superAdmin, "get", "/api/v1/talents/summary"))
        .body as typeof before;
      expect(after.total).toBe(before.total + 1);
      expect(after.assignedTalents).toBe(before.assignedTalents + 1);
      expect(after.activeAssignments).toBe(before.activeAssignments + 1);
      expect(Object.keys(after.byAvailability).sort()).toEqual([
        "ASSIGNED",
        "AVAILABLE",
        "INACTIVE",
        "UNAVAILABLE",
      ]);
    });

    it("denies the summary to someone who cannot read the directory", async () => {
      expect((await as(member, "get", "/api/v1/talents/summary")).status).toBe(
        403,
      );
    });
  });

  describe("profile photos", () => {
    it("uploads, verifies, and sets a profile photo, with a history entry and a view grant", async () => {
      const talent = await createTalent();
      const intent = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
      ).send({
        filename: "photo.png",
        mediaType: "image/png",
        sizeBytes: PNG_BYTES.length,
      });
      expect(intent.status).toBe(201);
      const fileId = (intent.body as { id: string }).id;
      const managed = await prisma.managedFile.findUniqueOrThrow({
        where: { id: fileId },
      });
      storage.objects.set(managed.storageKey, {
        bytes: PNG_BYTES,
        sizeBytes: PNG_BYTES.length,
      });

      const finalized = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/profile-image/${fileId}/finalize`,
      ).send({});
      expect(finalized.status).toBe(200);
      expect(
        await prisma.talent.findUniqueOrThrow({ where: { id: talent.id } }),
      ).toMatchObject({ profileImageId: fileId });
      expect(
        await prisma.talentActivity.count({
          where: { talentId: talent.id, type: "PROFILE_IMAGE_CHANGED" },
        }),
      ).toBe(1);

      const grant = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${talent.id}/profile-image`,
      );
      expect(grant.status).toBe(200);
      expect(grant.body).toMatchObject({ mediaType: "image/png" });

      // The profile record points at the authorized content route, and the bytes stream from it.
      const profile = (
        await as(superAdmin, "get", `/api/v1/talents/${talent.id}`)
      ).body as {
        profileImageUrl: string | null;
      };
      expect(profile.profileImageUrl).toBe(
        `/api/v1/talents/${talent.id}/profile-image/content?v=${fileId}`,
      );
      const content = await as(superAdmin, "get", profile.profileImageUrl!)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });
      expect(content.status).toBe(200);
      // The web app is served from another port, so the photo must be embeddable same-site.
      expect(content.headers["cross-origin-resource-policy"]).toBe("same-site");
      expect(content.headers["content-type"]).toMatch(/^image\/png/);
      expect(content.headers["cache-control"]).toBe("private, max-age=300");
      expect(Buffer.from(content.body as Buffer).equals(PNG_BYTES)).toBe(true);

      // An unauthenticated request is refused, so photos are never public.
      expect((await request(http).get(profile.profileImageUrl!)).status).toBe(
        401,
      );
    });

    it("replaces the photo and keeps the previous file for cleanup rather than deleting it", async () => {
      const talent = await createTalent();
      const first = (
        await as(
          superAdmin,
          "post",
          `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
        ).send({
          filename: "a.png",
          mediaType: "image/png",
          sizeBytes: PNG_BYTES.length,
        })
      ).body as { id: string };
      storage.objects.set(
        (
          await prisma.managedFile.findUniqueOrThrow({
            where: { id: first.id },
          })
        ).storageKey,
        { bytes: PNG_BYTES, sizeBytes: PNG_BYTES.length },
      );
      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/profile-image/${first.id}/finalize`,
      ).send({});
      const second = (
        await as(
          superAdmin,
          "post",
          `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
        ).send({
          filename: "b.png",
          mediaType: "image/png",
          sizeBytes: PNG_BYTES.length,
        })
      ).body as { id: string };
      storage.objects.set(
        (
          await prisma.managedFile.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).storageKey,
        { bytes: PNG_BYTES, sizeBytes: PNG_BYTES.length },
      );
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/talents/${talent.id}/profile-image/${second.id}/finalize`,
          ).send({})
        ).status,
      ).toBe(200);
      expect(
        (await prisma.talent.findUniqueOrThrow({ where: { id: talent.id } }))
          .profileImageId,
      ).toBe(second.id);
      expect(
        (
          await prisma.managedFile.findUniqueOrThrow({
            where: { id: first.id },
          })
        ).state,
      ).toBe("UNAVAILABLE");
    });

    it("refuses a non-image declaration", async () => {
      const talent = await createTalent();
      const response = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
      ).send({
        filename: "notes.pdf",
        mediaType: "application/pdf",
        sizeBytes: 100,
      });
      expect(response.status).toBe(400);
      expect((response.body as ProblemBody).code).toBe(
        "TALENT_PROFILE_IMAGE_TYPE_NOT_ALLOWED",
      );
    });

    it("refuses a photo change from a Production Manager, a Member, and for an unknown talent", async () => {
      const talent = await createTalent();
      const body = {
        filename: "a.png",
        mediaType: "image/png",
        sizeBytes: 100,
      };
      expect(
        (
          await as(
            productionManager,
            "post",
            `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
          ).send(body)
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            member,
            "post",
            `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
          ).send(body)
        ).status,
      ).toBe(403);
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/talents/${UUID}/profile-image/upload-intents`,
          ).send(body)
        ).status,
      ).toBe(404);
    });

    it("lets an Admin change a photo, and refuses finalizing an intent that belongs to another talent", async () => {
      const talent = await createTalent();
      const other = await createTalent();
      const intent = (
        await as(
          admin,
          "post",
          `/api/v1/talents/${talent.id}/profile-image/upload-intents`,
        ).send({
          filename: "a.png",
          mediaType: "image/png",
          sizeBytes: PNG_BYTES.length,
        })
      ).body as { id: string };
      expect(intent.id).toBeDefined();
      const wrongTalent = await as(
        admin,
        "post",
        `/api/v1/talents/${other.id}/profile-image/${intent.id}/finalize`,
      ).send({});
      expect(wrongTalent.status).toBe(404);
    });
  });

  describe("other department managers keep the access they already had", () => {
    it("still attaches talent to a production in their own department through the production route", async () => {
      const talent = await createTalent();
      const productionId = await productionRow({
        departmentId: marketingDeptId,
      });
      const assigned = await as(
        marketingManager,
        "put",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      ).send({ role: "Crew" });
      expect(assigned.status).toBe(200);
      const removed = await as(
        marketingManager,
        "delete",
        `/api/v1/productions/${productionId}/talents/${talent.id}`,
      );
      expect(removed.status).toBe(200);
    });

    it("gets no new talent permissions: the assignment API and the talent directory stay closed to them", async () => {
      const talent = await createTalent();
      const eventId = await eventRow({ departmentId: marketingDeptId });
      expect(
        (await assignToEvent(marketingManager, talent.id, eventId)).status,
      ).toBe(403);
      expect(
        (await as(marketingManager, "get", `/api/v1/talents/${talent.id}`))
          .status,
      ).toBe(403);
      expect(
        (await as(marketingManager, "get", "/api/v1/talents/summary")).status,
      ).toBe(403);
    });

    it("keeps the production route closed to them for a production outside their department", async () => {
      const talent = await createTalent();
      const productionId = await productionRow({
        departmentId: productionDeptId,
      });
      expect(
        (
          await as(
            marketingManager,
            "put",
            `/api/v1/productions/${productionId}/talents/${talent.id}`,
          ).send({ role: "Crew" })
        ).status,
      ).toBe(403);
    });
  });

  describe("access is unchanged for other roles", () => {
    it("denies a Department Member every talent integrity route", async () => {
      const talent = await createTalent();
      expect(
        (await as(member, "get", `/api/v1/talents/${talent.id}/assignments`))
          .status,
      ).toBe(403);
      expect(
        (await as(member, "get", `/api/v1/talents/${talent.id}/activity`))
          .status,
      ).toBe(403);
    });

    it("rejects an unauthenticated request", async () => {
      expect(
        (await request(http).get(`/api/v1/talents/${UUID}/profile-image`))
          .status,
      ).toBe(401);
    });
  });
});
