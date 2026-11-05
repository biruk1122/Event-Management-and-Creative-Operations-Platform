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
const UUID = "00000000-0000-0000-0000-000000000000";

interface Principal {
  cookies: string[];
  csrfToken: string;
  userId: string;
}

interface AssignmentBody {
  kind: string;
  id: string;
  workId: string;
  workName: string;
  role: string;
  status: string;
  phase: string;
  startAt: string | null;
  endAt: string | null;
  cancelReason: string | null;
  cancelledBy: { id: string } | null;
}

interface TalentBody {
  id: string;
  email: string | null;
  phone: string | null;
  availability: string;
}

interface ProblemBody {
  code: string;
  errors?: unknown[];
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

const day = (n: number) => new Date(Date.UTC(2027, 5, n, 10));

/**
 * TAL-ASSIGN - the assignment workflow over HTTP against a migrated database:
 * recording, conflicts and explicit override, inactive and duplicate blocks,
 * cancellation and completion with new records after a cancel, the archive
 * rule, Production Manager scope and contact masking, Member denial, Admin
 * access, and unauthenticated requests.
 */
describe("talent assignments API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let admin: Principal;
  let productionManager: Principal;
  let member: Principal;
  let talentManagerId: string;
  let productionDeptId: string;
  let marketingDeptId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "talent-assign-access-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "talent-assign-refresh-secret-at-least-32-chars";
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
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function seedUser(
      email: string,
      role: string,
      departmentId?: string,
    ) {
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

    superAdmin = await seedUser("super-admin@assign.test", "Super Admin");
    admin = await seedUser("admin@assign.test", "Admin", marketingDeptId);
    productionManager = await seedUser(
      "prod-manager@assign.test",
      "Department Manager",
      productionDeptId,
    );
    member = await seedUser("member@assign.test", "Department Member");
    talentManagerId = (
      await seedUser("talent-manager@assign.test", "Super Admin")
    ).userId;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "patch",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function createTalent(
    principal: Principal = superAdmin,
    extra: Record<string, unknown> = {},
  ): Promise<TalentBody> {
    const response = await as(principal, "post", "/api/v1/talents").send({
      fullName: `Talent ${Math.random().toString(36).slice(2)}`,
      type: "MUSICIAN",
      managerId: talentManagerId,
      email: "talent-contact@assign.test",
      phone: "+251 911 000 000",
      ...extra,
    });
    expect(response.status).toBe(201);
    return response.body as TalentBody;
  }

  async function eventRow(
    opts: { departmentId?: string | null; startAt?: Date; endAt?: Date } = {},
  ) {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name: `Event ${Math.random().toString(36).slice(2)}`,
        eventType: "CONCERT",
        departmentId: opts.departmentId ?? null,
        startAt: opts.startAt ?? day(1),
        endAt: opts.endAt ?? day(2),
      },
    });
    return event.id;
  }

  async function productionRow(opts: {
    departmentId: string | null;
    startAt?: Date;
    endAt?: Date;
  }) {
    const workspace = await prisma.workspace.create({
      data: { kind: "PRODUCTION" },
    });
    const production = await prisma.production.create({
      data: {
        workspaceId: workspace.id,
        name: `Production ${Math.random().toString(36).slice(2)}`,
        productionType: "STAGE",
        departmentId: opts.departmentId,
        startAt: opts.startAt ?? day(3),
        endAt: opts.endAt ?? day(4),
      },
    });
    return production.id;
  }

  async function promotionRow(opts: {
    departmentId: string | null;
    startAt?: Date;
    endAt?: Date;
  }) {
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
        startAt: opts.startAt ?? day(5),
        endAt: opts.endAt ?? day(6),
      },
    });
    await prisma.promotionActivity.create({
      data: {
        campaignActivityId: activity.id,
        campaignId: campaign.id,
        channel: "SOCIAL_MEDIA",
      },
    });
    return activity.id;
  }

  function assign(
    principal: Principal,
    talentId: string,
    body: Record<string, unknown>,
  ) {
    return as(
      principal,
      "post",
      `/api/v1/talents/${talentId}/assignments`,
    ).send(body);
  }

  describe("recording and history", () => {
    it("records an assignment, its history entry, its audit record, and a notification to the talent manager", async () => {
      const talent = await createTalent();
      const eventId = await eventRow({ departmentId: productionDeptId });

      const created = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: eventId,
        role: "Headliner",
      });
      expect(created.status).toBe(201);
      const assignment = created.body as AssignmentBody;
      expect(assignment).toMatchObject({
        kind: "EVENT",
        status: "ASSIGNED",
        role: "Headliner",
      });

      const list = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${talent.id}/assignments`,
      );
      expect((list.body as AssignmentBody[]).map((row) => row.id)).toContain(
        assignment.id,
      );

      const history = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${talent.id}/activity`,
      );
      expect(
        (history.body as { type: string; assignmentId: string }[]).some(
          (entry) =>
            entry.type === "ASSIGNMENT_CREATED" &&
            entry.assignmentId === assignment.id,
        ),
      ).toBe(true);

      const audit = await prisma.auditRecord.findFirst({
        where: { action: "talent.assignment.created", resourceId: talent.id },
      });
      expect(audit).not.toBeNull();

      const outbox = await prisma.outboxEvent.findMany({
        where: { name: "talent.assigned", resourceId: talent.id },
      });
      expect(outbox).toHaveLength(1);
      expect(
        (outbox[0]!.payload as { recipientUserId: string }).recipientUserId,
      ).toBe(talentManagerId);
    });

    it("rejects an unauthenticated request", async () => {
      const response = await request(http).get(
        `/api/v1/talents/${UUID}/assignments`,
      );
      expect(response.status).toBe(401);
    });
  });

  describe("conflicts and explicit override", () => {
    it("refuses an overlapping assignment until the conflict is acknowledged, then records the override", async () => {
      const talent = await createTalent();
      const first = await eventRow({ startAt: day(10), endAt: day(12) });
      const second = await eventRow({ startAt: day(11), endAt: day(13) });
      expect(
        (
          await assign(superAdmin, talent.id, {
            kind: "EVENT",
            workId: first,
            role: "Lead",
          })
        ).status,
      ).toBe(201);

      const refused = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: second,
        role: "Support",
      });
      expect(refused.status).toBe(409);
      expect((refused.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_CONFLICT",
      );
      expect((refused.body as ProblemBody).errors).toEqual([
        expect.objectContaining({ type: "ASSIGNMENT_OVERLAP" }),
      ]);

      const overridden = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: second,
        role: "Support",
        acknowledgeConflicts: true,
        overrideReason: "Confirmed with the artist",
      });
      expect(overridden.status).toBe(201);

      const overrides = await prisma.talentConflictOverride.findMany({
        where: { talentId: talent.id },
      });
      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.reason).toBe("Confirmed with the artist");
      expect(overrides[0]!.authorizedById).toBe(superAdmin.userId);
      expect(overrides[0]!.conflicts).toEqual([
        expect.objectContaining({ type: "ASSIGNMENT_OVERLAP" }),
      ]);

      const history = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${talent.id}/activity`,
      );
      expect(
        (history.body as { type: string }[]).some(
          (entry) => entry.type === "CONFLICT_OVERRIDDEN",
        ),
      ).toBe(true);
      expect(
        await prisma.auditRecord.count({
          where: {
            action: "talent.conflict_overridden",
            resourceId: talent.id,
          },
        }),
      ).toBe(1);
    });

    it("never lets an acknowledgement bypass the duplicate rule", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      expect(
        (
          await assign(superAdmin, talent.id, {
            kind: "EVENT",
            workId: eventId,
            role: "Lead",
          })
        ).status,
      ).toBe(201);
      const duplicate = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: eventId,
        role: "Lead",
        acknowledgeConflicts: true,
      });
      expect(duplicate.status).toBe(409);
      expect((duplicate.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_DUPLICATE",
      );
    });

    it("blocks inactive talent even when a conflict is acknowledged", async () => {
      const talent = await createTalent();
      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/transition`,
      ).send({ availability: "INACTIVE" });
      const eventId = await eventRow();
      const response = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: eventId,
        role: "Lead",
        acknowledgeConflicts: true,
      });
      expect(response.status).toBe(409);
      expect((response.body as ProblemBody).code).toBe("TALENT_INACTIVE");
    });
  });

  describe("cancellation, completion, and history", () => {
    it("cancels with a reason, then creates a new record when the same work is assigned again", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      const original = (
        await assign(superAdmin, talent.id, {
          kind: "EVENT",
          workId: eventId,
          role: "Lead",
        })
      ).body as AssignmentBody;

      const noReason = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/assignments/EVENT/${original.id}/transition`,
      ).send({ status: "CANCELLED" });
      expect(noReason.status).toBe(400);
      expect((noReason.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_REASON_REQUIRED",
      );

      const cancelled = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/assignments/EVENT/${original.id}/transition`,
      ).send({ status: "CANCELLED", reason: "Artist withdrew" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({
        status: "CANCELLED",
        cancelReason: "Artist withdrew",
      });
      expect((cancelled.body as AssignmentBody).cancelledBy?.id).toBe(
        superAdmin.userId,
      );
      expect(
        await prisma.outboxEvent.count({
          where: { name: "talent.assignment_cancelled", resourceId: talent.id },
        }),
      ).toBe(1);

      const again = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: eventId,
        role: "Replacement",
      });
      expect(again.status).toBe(201);
      const newId = (again.body as AssignmentBody).id;
      expect(newId).not.toBe(original.id);

      const rows = await prisma.eventTalent.findMany({
        where: { talentId: talent.id, eventId },
        orderBy: { assignedAt: "asc" },
      });
      expect(rows.map((row) => row.status)).toEqual(["CANCELLED", "ASSIGNED"]);
      expect(rows[0]!.cancelReason).toBe("Artist withdrew");

      const frozen = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/assignments/EVENT/${original.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(frozen.status).toBe(409);
      expect((frozen.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_TERMINAL",
      );
    });

    it("completes an assignment and records who completed it", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      const row = (
        await assign(superAdmin, talent.id, {
          kind: "EVENT",
          workId: eventId,
          role: "Lead",
        })
      ).body as AssignmentBody;
      const done = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/assignments/EVENT/${row.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ status: "COMPLETED" });
      const stored = await prisma.eventTalent.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(stored.completedById).toBe(superAdmin.userId);
      expect(stored.completedAt).not.toBeNull();
    });
  });

  describe("archiving", () => {
    it("refuses to archive a talent with active assignments, and allows it once they are gone", async () => {
      const talent = await createTalent();
      const eventId = await eventRow();
      const row = (
        await assign(superAdmin, talent.id, {
          kind: "EVENT",
          workId: eventId,
          role: "Lead",
        })
      ).body as AssignmentBody;

      const blocked = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/transition`,
      ).send({ availability: "INACTIVE" });
      expect(blocked.status).toBe(409);
      expect((blocked.body as ProblemBody).code).toBe(
        "TALENT_HAS_ACTIVE_ASSIGNMENTS",
      );

      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/assignments/EVENT/${row.id}/transition`,
      ).send({ status: "COMPLETED" });
      const archived = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talent.id}/transition`,
      ).send({ availability: "INACTIVE" });
      expect(archived.status).toBe(200);
      expect((archived.body as TalentBody).availability).toBe("INACTIVE");
    });
  });

  describe("Production Manager scope", () => {
    it("assigns to events in their own department only, and sees only that department's assignments", async () => {
      const talent = await createTalent();
      const own = await eventRow({ departmentId: productionDeptId });
      const other = await eventRow({
        departmentId: marketingDeptId,
        startAt: day(20),
        endAt: day(21),
      });

      expect(
        (
          await assign(productionManager, talent.id, {
            kind: "EVENT",
            workId: own,
            role: "Host",
          })
        ).status,
      ).toBe(201);
      const denied = await assign(productionManager, talent.id, {
        kind: "EVENT",
        workId: other,
        role: "Host",
      });
      expect(denied.status).toBe(403);

      expect(
        (
          await assign(superAdmin, talent.id, {
            kind: "EVENT",
            workId: other,
            role: "Guest",
          })
        ).status,
      ).toBe(201);
      const visible = (
        await as(
          productionManager,
          "get",
          `/api/v1/talents/${talent.id}/assignments`,
        )
      ).body as AssignmentBody[];
      expect(visible.map((row) => row.workId)).toEqual([own]);
    });

    it("assigns to productions in their own department and never to promotional activities", async () => {
      const talent = await createTalent();
      const ownProduction = await productionRow({
        departmentId: productionDeptId,
      });
      const promotion = await promotionRow({ departmentId: productionDeptId });
      expect(
        (
          await assign(productionManager, talent.id, {
            kind: "PRODUCTION",
            workId: ownProduction,
            role: "Stage manager",
          })
        ).status,
      ).toBe(201);
      const refused = await assign(productionManager, talent.id, {
        kind: "PROMOTION",
        workId: promotion,
        role: "Ambassador",
      });
      expect(refused.status).toBe(403);
    });

    it("reads talent with contact details hidden, and cannot create or edit talent", async () => {
      const talent = await createTalent();
      const read = await as(
        productionManager,
        "get",
        `/api/v1/talents/${talent.id}`,
      );
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        id: talent.id,
        email: null,
        phone: null,
      });

      const create = await as(
        productionManager,
        "post",
        "/api/v1/talents",
      ).send({ fullName: "Blocked", type: "MUSICIAN" });
      expect(create.status).toBe(403);
      const update = await as(
        productionManager,
        "patch",
        `/api/v1/talents/${talent.id}`,
      ).send({ fullName: "Blocked" });
      expect(update.status).toBe(403);
    });

    it("shows a Production Manager only the history of their department's assignments", async () => {
      const talent = await createTalent();
      const own = await eventRow({ departmentId: productionDeptId });
      const other = await eventRow({
        departmentId: marketingDeptId,
        startAt: day(22),
        endAt: day(23),
      });
      expect(
        (
          await assign(productionManager, talent.id, {
            kind: "EVENT",
            workId: own,
            role: "Host",
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await assign(superAdmin, talent.id, {
            kind: "EVENT",
            workId: other,
            role: "Guest",
          })
        ).status,
      ).toBe(201);

      type HistoryEntry = { type: string; assignmentId: string | null };
      const full = (
        await as(superAdmin, "get", `/api/v1/talents/${talent.id}/activity`)
      ).body as HistoryEntry[];
      const scoped = (
        await as(
          productionManager,
          "get",
          `/api/v1/talents/${talent.id}/activity`,
        )
      ).body as HistoryEntry[];

      expect(
        full.filter((entry) => entry.type === "ASSIGNMENT_CREATED"),
      ).toHaveLength(2);
      expect(
        scoped.filter((entry) => entry.type === "ASSIGNMENT_CREATED"),
      ).toHaveLength(1);
      // Profile-level entries have no assignment and stay hidden from the scoped view.
      expect(scoped.every((entry) => entry.assignmentId !== null)).toBe(true);
    });

    it("lists only the works they may assign to", async () => {
      const own = await eventRow({ departmentId: productionDeptId });
      const other = await eventRow({ departmentId: marketingDeptId });
      const works = await as(
        productionManager,
        "get",
        "/api/v1/talent-assignments/works?kind=EVENT",
      );
      expect(works.status).toBe(200);
      const ids = (works.body as { id: string }[]).map((work) => work.id);
      expect(ids).toContain(own);
      expect(ids).not.toContain(other);
      expect(
        (
          await as(
            productionManager,
            "get",
            "/api/v1/talent-assignments/works?kind=PROMOTION",
          )
        ).status,
      ).toBe(403);
    });
  });

  describe("other roles", () => {
    it("denies a Department Member any talent assignment access", async () => {
      const talent = await createTalent();
      expect(
        (await as(member, "get", `/api/v1/talents/${talent.id}/assignments`))
          .status,
      ).toBe(403);
      const eventId = await eventRow({ departmentId: productionDeptId });
      expect(
        (
          await assign(member, talent.id, {
            kind: "EVENT",
            workId: eventId,
            role: "Lead",
          })
        ).status,
      ).toBe(403);
    });

    it("gives Admin full talent access, including contact details and every work kind", async () => {
      const talent = await createTalent();
      const read = await as(admin, "get", `/api/v1/talents/${talent.id}`);
      expect(read.status).toBe(200);
      expect((read.body as TalentBody).email).toBe(
        "talent-contact@assign.test",
      );

      const production = await productionRow({ departmentId: marketingDeptId });
      expect(
        (
          await assign(admin, talent.id, {
            kind: "PRODUCTION",
            workId: production,
            role: "Host",
          })
        ).status,
      ).toBe(201);
      const promotion = await promotionRow({ departmentId: marketingDeptId });
      expect(
        (
          await assign(admin, talent.id, {
            kind: "PROMOTION",
            workId: promotion,
            role: "Ambassador",
          })
        ).status,
      ).toBe(201);
    });

    it("returns not found for a work item that does not exist", async () => {
      const talent = await createTalent();
      const response = await assign(superAdmin, talent.id, {
        kind: "EVENT",
        workId: UUID,
        role: "Lead",
      });
      expect(response.status).toBe(404);
      expect((response.body as ProblemBody).code).toBe("TALENT_WORK_NOT_FOUND");
    });
  });
});
