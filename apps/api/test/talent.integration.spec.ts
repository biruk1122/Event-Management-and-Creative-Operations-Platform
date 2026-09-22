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
}

interface ProblemBody {
  code: string;
}

interface PersonSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface SocialLinkBody {
  id: string;
  label: string;
  url: string;
}

interface ScheduleBody {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

interface EventSummary {
  id: string;
  name: string;
}

interface AssignmentBody {
  id: string;
  event: EventSummary;
  role: string;
  status: string;
  assignedAt: string;
  updatedAt: string;
}

interface TalentBody {
  id: string;
  fullName: string;
  type: string;
  profileImageId: string | null;
  email: string | null;
  phone: string | null;
  biography: string | null;
  availability: string;
  manager: PersonSummary | null;
  socialLinks: SocialLinkBody[];
  schedules: ScheduleBody[];
  eventAssignments: AssignmentBody[];
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: TalentBody[];
  page: number;
  pageSize: number;
  total: number;
}

const TALENT_KEYS = [
  "availability",
  "biography",
  "createdAt",
  "email",
  "eventAssignments",
  "fullName",
  "id",
  "manager",
  "phone",
  "profileImageId",
  "schedules",
  "socialLinks",
  "type",
  "updatedAt",
].sort();

function body<T>(response: request.Response): T {
  return response.body as T;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const header = setCookie.find((entry) => entry.startsWith(`${name}=`));
  const value = header?.slice(name.length + 1).split(";")[0];
  if (!value) {
    throw new Error(`cookie ${name} not present`);
  }
  return value;
}

/**
 * TAL-03 - verifies the talent management HTTP surface end to end: auth,
 * CSRF, and permission enforcement (including the "Talent Manager" role,
 * the only role scoped to this module - Management/Administrator carries no
 * talent.* grants, unlike every other operational module); profile
 * create/read/list/update with field normalization; the manager
 * cross-reference; the availability and event-assignment lifecycle graphs;
 * social links and schedules; and the generic non-uuid-is-404-not-500
 * contract across every nested id in the module.
 */
describe("talent management API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let talentManager: Principal;
  let plainUser: Principal;
  let credentialHash: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "talent-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "talent-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    // This suite drives many requests from one IP; keep the general per-IP
    // limiter out of the way so it does not 429 an unrelated assertion.
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
    credentialHash = await new hasherModule.PasswordHasher().hash(PASSWORD);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function seedUser(email: string): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email,
          credential: { create: { passwordHash: credentialHash } },
        },
      });
      return user.id;
    }
    async function assignRole(userId: string, roleName: string): Promise<void> {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.userRoleAssignment.create({
        data: { userId, roleId: role.id },
      });
    }
    async function loginAs(email: string): Promise<Principal> {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }

    const superAdminId = await seedUser("super-admin@talent.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("super-admin@talent.test");

    const talentManagerId = await seedUser("talent-manager@talent.test");
    await assignRole(talentManagerId, "Talent Manager");
    talentManager = await loginAs("talent-manager@talent.test");

    await seedUser("plain@talent.test");
    plainUser = await loginAs("plain@talent.test");
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
    principal: Principal = superAdmin,
    payload: Record<string, unknown> = {},
  ): Promise<TalentBody> {
    const response = await as(principal, "post", "/api/v1/talents").send({
      fullName: `Talent ${Math.random().toString(36).slice(2)}`,
      type: "MUSICIAN",
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<TalentBody>(response);
  }

  async function createUser(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/users").send({
      email: `member-${Math.random().toString(36).slice(2)}@talent.test`,
      firstName: "Mem",
      lastName: "Ber",
      temporaryPassword: "temp-password-123",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  async function createEvent(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/events").send({
      name: `Event ${Math.random().toString(36).slice(2)}`,
      eventType: "CONCERT",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response).id;
  }

  describe("authentication, CSRF, and authorization", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await request(http).get("/api/v1/talents")).status).toBe(401);
    });

    it("rejects a mutation missing the CSRF header", async () => {
      const response = await request(http)
        .post("/api/v1/talents")
        .set("Cookie", superAdmin.cookies)
        .send({ fullName: "No CSRF", type: "MUSICIAN" });
      expect(response.status).toBe(403);
    });

    it("denies a user without talent permissions and writes nothing", async () => {
      const before = await prisma.talent.count();
      const response = await as(plainUser, "post", "/api/v1/talents").send({
        fullName: "Denied",
        type: "MUSICIAN",
      });
      expect(response.status).toBe(403);
      expect(body<ProblemBody>(response).code).toBe("PERMISSION_DENIED");
      expect(await prisma.talent.count()).toBe(before);
    });

    it("denies list and read for a user without talent permissions", async () => {
      const list = await as(plainUser, "get", "/api/v1/talents");
      expect(list.status).toBe(403);

      const created = await createTalent();
      const read = await as(plainUser, "get", `/api/v1/talents/${created.id}`);
      expect(read.status).toBe(403);
    });

    it("lets the Talent Manager role perform the module's full lifecycle", async () => {
      const created = await createTalent(talentManager, {
        fullName: "Role Smoke Test",
      });

      const managerId = await createUser();
      const managed = await as(
        talentManager,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({ managerId });
      expect(managed.status).toBe(200);

      const transitioned = await as(
        talentManager,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "ASSIGNED" });
      expect(transitioned.status).toBe(200);

      const social = await as(
        talentManager,
        "post",
        `/api/v1/talents/${created.id}/social-links`,
      ).send({ label: "Instagram", url: "https://instagram.com/role-smoke" });
      expect(social.status).toBe(201);

      const scheduled = await as(
        talentManager,
        "post",
        `/api/v1/talents/${created.id}/schedules`,
      ).send({
        title: "Sound check",
        startAt: "2026-06-01T10:00:00.000Z",
        endAt: "2026-06-01T11:00:00.000Z",
      });
      expect(scheduled.status).toBe(201);

      const eventId = await createEvent();
      const assigned = await as(
        talentManager,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId, role: "Headliner" });
      expect(assigned.status).toBe(201);
    });
  });

  describe("create, read, and list", () => {
    it("creates a talent, normalizes fields, and returns only the public contract", async () => {
      const managerId = await createUser();
      const response = await as(superAdmin, "post", "/api/v1/talents").send({
        fullName: "  Amina Tesfaye  ",
        type: "MUSICIAN",
        // No surrounding whitespace here: unlike fullName's not-blank regex,
        // CreateTalentDto's `@IsEmail()` validates the raw string before the
        // service's own `.trim()` runs, so a padded email 400s.
        email: "AMINA@Example.com",
        phone: "  +251911000000  ",
        biography: "  Singer and live performer.  ",
        managerId,
      });
      expect(response.status).toBe(201);
      const created = body<TalentBody>(response);

      expect(created.fullName).toBe("Amina Tesfaye");
      expect(created.email).toBe("amina@example.com");
      expect(created.phone).toBe("+251911000000");
      expect(created.biography).toBe("Singer and live performer.");
      expect(created.availability).toBe("AVAILABLE");
      expect(created.manager?.id).toBe(managerId);
      expect(created.socialLinks).toEqual([]);
      expect(created.schedules).toEqual([]);
      expect(created.eventAssignments).toEqual([]);
      expect(Object.keys(created).sort()).toEqual(TALENT_KEYS);
    });

    it("404s an unknown manager on create and writes nothing", async () => {
      const before = await prisma.talent.count();
      const response = await as(superAdmin, "post", "/api/v1/talents").send({
        fullName: "Ghost Manager",
        type: "MUSICIAN",
        managerId: UUID,
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("USER_NOT_FOUND");
      expect(await prisma.talent.count()).toBe(before);
    });

    it("gets one talent and 404s an unknown id", async () => {
      const created = await createTalent();
      const found = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${created.id}`,
      );
      expect(found.status).toBe(200);
      expect(body<TalentBody>(found).id).toBe(created.id);
      expect(Object.keys(body<TalentBody>(found)).sort()).toEqual(TALENT_KEYS);

      const missing = await as(superAdmin, "get", `/api/v1/talents/${UUID}`);
      expect(missing.status).toBe(404);
      expect(body<ProblemBody>(missing).code).toBe("TALENT_NOT_FOUND");
    });

    it("filters the list by type, availability, manager, and name", async () => {
      const managerId = await createUser();
      const target = await createTalent(superAdmin, {
        fullName: "Filter Target Rollout",
        type: "ARTIST",
        managerId,
      });
      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${target.id}/transition`,
      ).send({ availability: "UNAVAILABLE" });
      await createTalent(superAdmin, { fullName: "Other" });

      const byType = body<PageBody>(
        await as(superAdmin, "get", "/api/v1/talents?type=ARTIST&pageSize=100"),
      );
      expect(byType.items.map((t) => t.id)).toContain(target.id);
      expect(byType.items.every((t) => t.type === "ARTIST")).toBe(true);

      const byAvailability = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/talents?availability=UNAVAILABLE&pageSize=100",
        ),
      );
      expect(byAvailability.items.map((t) => t.id)).toContain(target.id);

      const byManager = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/talents?managerId=${managerId}&pageSize=100`,
        ),
      );
      expect(byManager.items.map((t) => t.id)).toEqual([target.id]);

      const bySearch = body<PageBody>(
        await as(
          superAdmin,
          "get",
          "/api/v1/talents?search=filter%20target&pageSize=100",
        ),
      );
      expect(bySearch.items.map((t) => t.id)).toEqual([target.id]);
    });

    it.each([
      ["a non-integer page", "/api/v1/talents?page=abc"],
      ["pageSize over the maximum", "/api/v1/talents?pageSize=101"],
      ["an unknown type", "/api/v1/talents?type=DANCER"],
      ["an unknown availability", "/api/v1/talents?availability=ARCHIVED"],
      ["a non-uuid managerId", "/api/v1/talents?managerId=nope"],
    ])("400s %s with VALIDATION_ERROR", async (_label, path) => {
      const response = await as(superAdmin, "get", path);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("keeps total stable and items disjoint across pages", async () => {
      const marker = Math.random().toString(36).slice(2);
      for (let i = 0; i < 3; i += 1) {
        await createTalent(superAdmin, { fullName: `Paged ${marker} ${i}` });
      }
      const p1 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/talents?search=${marker}&page=1&pageSize=2`,
        ),
      );
      const p2 = body<PageBody>(
        await as(
          superAdmin,
          "get",
          `/api/v1/talents?search=${marker}&page=2&pageSize=2`,
        ),
      );
      expect(p1.total).toBe(p2.total);
      expect(p1.total).toBe(3);
      const ids = new Set([
        ...p1.items.map((t) => t.id),
        ...p2.items.map((t) => t.id),
      ]);
      expect(ids.size).toBe(p1.items.length + p2.items.length);
    });
  });

  describe("update", () => {
    it("patches fields, clears a nullable one, and leaves the rest", async () => {
      const created = await createTalent(superAdmin, {
        email: "first@talent.test",
        phone: "+251900000000",
      });

      const patched = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${created.id}`,
      ).send({ fullName: "Renamed", email: null });
      expect(patched.status).toBe(200);
      const bodyOut = body<TalentBody>(patched);
      expect(bodyOut.fullName).toBe("Renamed");
      expect(bodyOut.email).toBeNull();
      expect(bodyOut.phone).toBe("+251900000000");
    });

    it("404s a patch to an unknown talent", async () => {
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${UUID}`,
      ).send({ fullName: "x" });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("TALENT_NOT_FOUND");
    });

    it("400s a blank fullName", async () => {
      const created = await createTalent();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${created.id}`,
      ).send({ fullName: "   " });
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("manager", () => {
    it("sets and clears the manager, 404ing an unknown user", async () => {
      const created = await createTalent();
      const userId = await createUser();

      const set = await as(
        superAdmin,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({ managerId: userId });
      expect(set.status).toBe(200);
      expect(body<TalentBody>(set).manager?.id).toBe(userId);

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({ managerId: null });
      expect(cleared.status).toBe(200);
      expect(body<TalentBody>(cleared).manager).toBeNull();

      const ghost = await as(
        superAdmin,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({ managerId: UUID });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("USER_NOT_FOUND");
    });

    // Unlike the projects manager route, Talent's DTO makes `managerId`
    // effectively optional: an absent key skips class-validator entirely
    // and the service treats `undefined` the same as an explicit `null`.
    it("treats an empty body as clearing the manager, not a validation error", async () => {
      const created = await createTalent();
      const managerId = await createUser();
      await as(superAdmin, "put", `/api/v1/talents/${created.id}/manager`).send(
        { managerId },
      );

      const cleared = await as(
        superAdmin,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({});
      expect(cleared.status).toBe(200);
      expect(body<TalentBody>(cleared).manager).toBeNull();
    });

    it("denies setting the manager to a user without talent.update", async () => {
      const created = await createTalent();
      const response = await as(
        plainUser,
        "put",
        `/api/v1/talents/${created.id}/manager`,
      ).send({ managerId: null });
      expect(response.status).toBe(403);
    });
  });

  describe("availability transitions", () => {
    it("moves along the approved graph and rejects an illegal move", async () => {
      const created = await createTalent();

      const assigned = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "ASSIGNED" });
      expect(assigned.status).toBe(200);
      expect(body<TalentBody>(assigned).availability).toBe("ASSIGNED");

      const backToAvailable = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "AVAILABLE" });
      expect(backToAvailable.status).toBe(200);

      const inactive = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "INACTIVE" });
      expect(inactive.status).toBe(200);

      const reactivate = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "AVAILABLE" });
      expect(reactivate.status).toBe(409);
      expect(body<ProblemBody>(reactivate).code).toBe(
        "TALENT_AVAILABILITY_TRANSITION_INVALID",
      );
    });

    it("400s an unknown target availability and 404s an unknown talent", async () => {
      const created = await createTalent();
      const bad = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/transition`,
      ).send({ availability: "ARCHIVED" });
      expect(bad.status).toBe(400);
      expect(body<ProblemBody>(bad).code).toBe("VALIDATION_ERROR");

      const ghost = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${UUID}/transition`,
      ).send({ availability: "ASSIGNED" });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("TALENT_NOT_FOUND");
    });
  });

  describe("social links", () => {
    it("creates a link, 409s a duplicate url, and deletes idempotently", async () => {
      const created = await createTalent();

      const first = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/social-links`,
      ).send({ label: "Instagram", url: "https://instagram.com/amina" });
      expect(first.status).toBe(201);
      const link = body<TalentBody>(first).socialLinks[0]!;

      const duplicate = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/social-links`,
      ).send({ label: "Instagram again", url: "https://instagram.com/amina" });
      expect(duplicate.status).toBe(409);
      expect(body<ProblemBody>(duplicate).code).toBe(
        "TALENT_SOCIAL_LINK_CONFLICT",
      );

      const deleted = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/social-links/${link.id}`,
      );
      expect(deleted.status).toBe(204);

      const deletedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/social-links/${link.id}`,
      );
      expect(deletedAgain.status).toBe(404);
      expect(body<ProblemBody>(deletedAgain).code).toBe(
        "TALENT_SOCIAL_LINK_NOT_FOUND",
      );
    });

    it("400s an invalid url and 404s an unknown talent", async () => {
      const created = await createTalent();
      const invalid = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/social-links`,
      ).send({ label: "Bad", url: "not a url" });
      expect(invalid.status).toBe(400);
      expect(body<ProblemBody>(invalid).code).toBe("VALIDATION_ERROR");

      const ghost = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${UUID}/social-links`,
      ).send({ label: "Instagram", url: "https://instagram.com/ghost" });
      expect(ghost.status).toBe(404);
      expect(body<ProblemBody>(ghost).code).toBe("TALENT_NOT_FOUND");
    });
  });

  describe("schedules", () => {
    it("creates, patches, and deletes a schedule idempotently", async () => {
      const created = await createTalent();

      const scheduled = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/schedules`,
      ).send({
        title: "Dress rehearsal",
        startAt: "2026-05-01T10:00:00.000Z",
        endAt: "2026-05-01T12:00:00.000Z",
      });
      expect(scheduled.status).toBe(201);
      const schedule = body<TalentBody>(scheduled).schedules[0]!;
      expect(schedule.title).toBe("Dress rehearsal");

      const patched = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${created.id}/schedules/${schedule.id}`,
      ).send({ title: "Final rehearsal" });
      expect(patched.status).toBe(200);
      expect(
        body<TalentBody>(patched).schedules.find((s) => s.id === schedule.id)
          ?.title,
      ).toBe("Final rehearsal");

      const deleted = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/schedules/${schedule.id}`,
      );
      expect(deleted.status).toBe(204);

      const deletedAgain = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/schedules/${schedule.id}`,
      );
      expect(deletedAgain.status).toBe(404);
      expect(body<ProblemBody>(deletedAgain).code).toBe(
        "TALENT_SCHEDULE_NOT_FOUND",
      );
    });

    it("400s an end at or before the start, on both create and patch", async () => {
      const created = await createTalent();
      const badCreate = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/schedules`,
      ).send({
        title: "Backwards",
        startAt: "2026-05-01T12:00:00.000Z",
        endAt: "2026-05-01T10:00:00.000Z",
      });
      expect(badCreate.status).toBe(400);
      expect(body<ProblemBody>(badCreate).code).toBe("TALENT_SCHEDULE_INVALID");

      const scheduled = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/schedules`,
      ).send({
        title: "Valid",
        startAt: "2026-05-01T10:00:00.000Z",
        endAt: "2026-05-01T12:00:00.000Z",
      });
      const schedule = body<TalentBody>(scheduled).schedules[0]!;

      const badPatch = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${created.id}/schedules/${schedule.id}`,
      ).send({ endAt: "2026-05-01T09:00:00.000Z" });
      expect(badPatch.status).toBe(400);
      expect(body<ProblemBody>(badPatch).code).toBe("TALENT_SCHEDULE_INVALID");
    });

    it("404s scheduling for an unknown talent", async () => {
      const response = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${UUID}/schedules`,
      ).send({
        title: "Ghost",
        startAt: "2026-05-01T10:00:00.000Z",
        endAt: "2026-05-01T12:00:00.000Z",
      });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe("TALENT_NOT_FOUND");
    });
  });

  describe("event assignments", () => {
    it("assigns to an event, 409s a duplicate, and 404s an unknown event", async () => {
      const created = await createTalent();
      const eventId = await createEvent();

      const assigned = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId, role: "Headliner" });
      expect(assigned.status).toBe(201);
      const assignment = body<TalentBody>(assigned).eventAssignments[0]!;
      expect(assignment.status).toBe("ASSIGNED");
      expect(assignment.event.id).toBe(eventId);

      const duplicate = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId, role: "Again" });
      expect(duplicate.status).toBe(409);
      expect(body<ProblemBody>(duplicate).code).toBe(
        "TALENT_EVENT_ASSIGNMENT_CONFLICT",
      );

      const ghostEvent = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId: UUID, role: "Headliner" });
      expect(ghostEvent.status).toBe(404);
      expect(body<ProblemBody>(ghostEvent).code).toBe("EVENT_NOT_FOUND");
    });

    it("moves along the approved graph and rejects a move out of a terminal state", async () => {
      const created = await createTalent();
      const eventId = await createEvent();
      const assigned = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId, role: "Headliner" });
      const assignment = body<TalentBody>(assigned).eventAssignments[0]!;

      const completed = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments/${assignment.id}/transition`,
      ).send({ status: "COMPLETED" });
      expect(completed.status).toBe(200);
      expect(
        body<TalentBody>(completed).eventAssignments.find(
          (a) => a.id === assignment.id,
        )?.status,
      ).toBe("COMPLETED");

      const reopen = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments/${assignment.id}/transition`,
      ).send({ status: "CANCELLED" });
      expect(reopen.status).toBe(409);
      expect(body<ProblemBody>(reopen).code).toBe(
        "TALENT_ASSIGNMENT_TRANSITION_INVALID",
      );
    });

    it("404s transitioning an unknown assignment", async () => {
      const created = await createTalent();
      const response = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments/${UUID}/transition`,
      ).send({ status: "COMPLETED" });
      expect(response.status).toBe(404);
      expect(body<ProblemBody>(response).code).toBe(
        "TALENT_ASSIGNMENT_NOT_FOUND",
      );
    });

    it("denies assignment to a user without talent.assign", async () => {
      const created = await createTalent();
      const eventId = await createEvent();
      const response = await as(
        plainUser,
        "post",
        `/api/v1/talents/${created.id}/event-assignments`,
      ).send({ eventId, role: "Headliner" });
      expect(response.status).toBe(403);
    });
  });

  describe("request validation and transport", () => {
    it.each([
      ["a missing fullName", { type: "MUSICIAN" }],
      ["a blank fullName", { fullName: "  ", type: "MUSICIAN" }],
      ["a missing type", { fullName: "x" }],
      ["an unknown type", { fullName: "x", type: "DANCER" }],
      [
        "a non-uuid managerId",
        { fullName: "x", type: "MUSICIAN", managerId: "no" },
      ],
      ["a malformed email", { fullName: "x", type: "MUSICIAN", email: "nope" }],
    ])("400s create with %s", async (_label, payload) => {
      const response = await as(superAdmin, "post", "/api/v1/talents").send(
        payload,
      );
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    });

    it("treats a non-uuid :id as not-found, never a 500", async () => {
      for (const [method, path] of [
        ["get", "/api/v1/talents/not-a-uuid"],
        ["patch", "/api/v1/talents/not-a-uuid"],
      ] as const) {
        const req = as(superAdmin, method, path);
        const response =
          method === "patch" ? await req.send({ fullName: "x" }) : await req;
        expect(response.status).toBe(404);
        expect(body<ProblemBody>(response).code).toBe("TALENT_NOT_FOUND");
      }

      const manager = await as(
        superAdmin,
        "put",
        "/api/v1/talents/not-a-uuid/manager",
      ).send({ managerId: null });
      expect(manager.status).toBe(404);
      expect(body<ProblemBody>(manager).code).toBe("TALENT_NOT_FOUND");

      const transition = await as(
        superAdmin,
        "post",
        "/api/v1/talents/not-a-uuid/transition",
      ).send({ availability: "ASSIGNED" });
      expect(transition.status).toBe(404);
      expect(body<ProblemBody>(transition).code).toBe("TALENT_NOT_FOUND");
    });

    it("treats a non-uuid nested :socialLinkId, :scheduleId, and :assignmentId as not-found", async () => {
      const created = await createTalent();

      const socialLink = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/social-links/not-a-uuid`,
      );
      expect(socialLink.status).toBe(404);
      expect(body<ProblemBody>(socialLink).code).toBe(
        "TALENT_SOCIAL_LINK_NOT_FOUND",
      );

      const schedule = await as(
        superAdmin,
        "delete",
        `/api/v1/talents/${created.id}/schedules/not-a-uuid`,
      );
      expect(schedule.status).toBe(404);
      expect(body<ProblemBody>(schedule).code).toBe(
        "TALENT_SCHEDULE_NOT_FOUND",
      );

      const assignment = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${created.id}/event-assignments/not-a-uuid/transition`,
      ).send({ status: "COMPLETED" });
      expect(assignment.status).toBe(404);
      expect(body<ProblemBody>(assignment).code).toBe(
        "TALENT_ASSIGNMENT_NOT_FOUND",
      );
    });

    it("returns a full Problem Details body and echoes x-request-id", async () => {
      const response = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${UUID}`,
      ).set("x-request-id", "talent-error-id");
      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.headers["x-request-id"]).toBe("talent-error-id");
      const problem = response.body as Record<string, unknown>;
      expect(problem).toMatchObject({
        code: "TALENT_NOT_FOUND",
        status: 404,
        title: "Not Found",
        instance: `/api/v1/talents/${UUID}`,
      });
      expect(typeof problem.type).toBe("string");
      expect(typeof problem.detail).toBe("string");
      expect(typeof problem.requestId).toBe("string");
    });

    it("echoes x-request-id on a successful mutation", async () => {
      const created = await createTalent();
      const response = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${created.id}`,
      )
        .set("x-request-id", "talent-mutation-id")
        .send({ fullName: "Echo" });
      expect(response.headers["x-request-id"]).toBe("talent-mutation-id");
    });
  });
});
