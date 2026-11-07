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

interface Principal {
  cookies: string[];
  csrfToken: string;
}

interface ProblemBody {
  code: string;
}

interface TeamBody {
  id: string;
  name: string;
  deactivatedAt?: string | null;
  members?: { id: string }[];
}

interface EventTeamBody {
  id: string;
  name: string;
  membersVisible: boolean;
  members: { id: string; email: string }[];
}

interface EventTalentBody {
  id: string;
  role: string;
  status: string;
  assignedBy: { id: string; displayName: string } | null;
  talent: { id: string; fullName: string; type: string; availability: string };
}

function setCookies(response: request.Response): string[] {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header : header ? [header] : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const match = setCookie
    .map((value) => value.match(new RegExp(`^${name}=([^;]+)`)))
    .find((found): found is RegExpMatchArray => found !== null);
  if (!match) throw new Error(`cookie ${name} missing`);
  return match[1]!;
}

function rand(): string {
  return Math.random().toString(36).slice(2);
}

describe("event workspace: teams and talents", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  let superAdmin: Principal;
  let plainUser: Principal;
  let departmentId: string;
  let credentialHash = "";

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "event-workspace-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "event-workspace-refresh-token-secret-at-least-32";
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
    const hash = await new hasherModule.PasswordHasher().hash(PASSWORD);
    credentialHash = hash;

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function login(email: string, roleName?: string): Promise<Principal> {
      const user = await prisma.user.create({
        data: { email, credential: { create: { passwordHash: hash } } },
      });
      if (roleName) {
        const role = await prisma.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await prisma.userRoleAssignment.create({
          data: { userId: user.id, roleId: role.id },
        });
      }
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }

    superAdmin = await login("super-admin@workspace.test", "Super Admin");
    plainUser = await login("plain@workspace.test");
    departmentId = (
      await prisma.department.create({
        data: { name: "Production" },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function createPrincipal(
    email: string,
    roleName: string,
    deptId: string | null,
  ): Promise<Principal> {
    const user = await prisma.user.create({
      data: {
        email,
        departmentId: deptId,
        credential: { create: { passwordHash: credentialHash } },
      },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: role.id },
    });
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    const cookies = setCookies(response);
    return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
  }

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

  async function createEvent(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/events").send({
      name: `Workspace event ${rand()}`,
      eventType: "CONCERT",
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function createTeam(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/teams").send({
      name: `Workspace team ${rand()}`,
      departmentId,
    });
    expect(response.status).toBe(201);
    return (response.body as TeamBody).id;
  }

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `member-${rand()}@workspace.test` },
    });
    return user.id;
  }

  async function createTalent(): Promise<string> {
    const response = await as(superAdmin, "post", "/api/v1/talents").send({
      fullName: `Talent ${rand()}`,
      type: "MUSICIAN",
      email: `talent-${rand()}@workspace.test`,
      phone: "+251 911 000 000",
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  describe("teams", () => {
    it("shows an assigned team with its members, and reflects membership changes both ways", async () => {
      const eventId = await createEvent();
      const teamId = await createTeam();
      const memberId = await createUser();

      const assign = await as(
        superAdmin,
        "put",
        `/api/v1/events/${eventId}/teams/${teamId}`,
      );
      expect(assign.status).toBe(200);

      const before = await as(
        superAdmin,
        "get",
        `/api/v1/events/${eventId}/teams`,
      );
      expect(before.status).toBe(200);
      const beforeTeams = before.body as EventTeamBody[];
      expect(beforeTeams.map((team) => team.id)).toEqual([teamId]);
      expect(beforeTeams[0]!.membersVisible).toBe(true);
      expect(beforeTeams[0]!.members).toEqual([]);

      // A change made in the main Teams module shows up in the event.
      const added = await as(
        superAdmin,
        "put",
        `/api/v1/teams/${teamId}/members/${memberId}`,
      );
      expect(added.status).toBe(200);
      const after = await as(
        superAdmin,
        "get",
        `/api/v1/events/${eventId}/teams`,
      );
      expect(
        (after.body as EventTeamBody[])[0]!.members.map((member) => member.id),
      ).toEqual([memberId]);

      // The event's team list and the central team agree.
      const central = await as(superAdmin, "get", `/api/v1/teams/${teamId}`);
      expect((central.body as TeamBody).members?.map((m) => m.id)).toEqual([
        memberId,
      ]);

      // Teams are filterable on the events list.
      const filtered = await as(
        superAdmin,
        "get",
        `/api/v1/events?teamId=${teamId}`,
      );
      expect(filtered.status).toBe(200);
      const items = (filtered.body as { items: { id: string }[] }).items;
      expect(items.map((item) => item.id)).toContain(eventId);
    });

    it("removing a team from an event keeps the team and its members", async () => {
      const eventId = await createEvent();
      const teamId = await createTeam();
      const memberId = await createUser();
      await as(superAdmin, "put", `/api/v1/events/${eventId}/teams/${teamId}`);
      await as(
        superAdmin,
        "put",
        `/api/v1/teams/${teamId}/members/${memberId}`,
      );

      const removed = await as(
        superAdmin,
        "delete",
        `/api/v1/events/${eventId}/teams/${teamId}`,
      );
      expect(removed.status).toBe(200);

      const eventTeams = await as(
        superAdmin,
        "get",
        `/api/v1/events/${eventId}/teams`,
      );
      expect(eventTeams.body).toEqual([]);

      const central = await as(superAdmin, "get", `/api/v1/teams/${teamId}`);
      expect(central.status).toBe(200);
      expect((central.body as TeamBody).members?.map((m) => m.id)).toEqual([
        memberId,
      ]);
    });

    it("refuses to newly assign a deactivated team, and keeps the team unchanged", async () => {
      const eventId = await createEvent();
      const teamId = await createTeam();
      const deactivate = await as(
        superAdmin,
        "post",
        `/api/v1/teams/${teamId}/deactivate`,
      );
      expect(deactivate.status).toBe(200);

      const response = await as(
        superAdmin,
        "put",
        `/api/v1/events/${eventId}/teams/${teamId}`,
      );
      expect(response.status).toBe(409);
      expect((response.body as ProblemBody).code).toBe(
        "EVENT_TEAM_DEACTIVATED",
      );

      const central = await as(superAdmin, "get", `/api/v1/teams/${teamId}`);
      expect((central.body as TeamBody).deactivatedAt).not.toBeNull();
    });

    it("denies a caller without event access", async () => {
      const eventId = await createEvent();
      const response = await as(
        plainUser,
        "get",
        `/api/v1/events/${eventId}/teams`,
      );
      expect(response.status).toBe(403);
    });
  });

  describe("talents", () => {
    it("assigns a central talent from the event, and the same record shows on the talent profile", async () => {
      const eventId = await createEvent();
      const talentId = await createTalent();

      const created = await as(
        superAdmin,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Headliner" });
      expect(created.status).toBe(201);
      const assignmentId = (created.body as { id: string }).id;

      const eventList = await as(
        superAdmin,
        "get",
        `/api/v1/events/${eventId}/talents`,
      );
      expect(eventList.status).toBe(200);
      const rows = eventList.body as EventTalentBody[];
      expect(rows.map((row) => row.id)).toEqual([assignmentId]);
      expect(rows[0]!.talent.id).toBe(talentId);
      // No email appears anywhere on the event side: not the talent's, and not
      // the staff member named in assignedBy, who is shown by display name only.
      expect(JSON.stringify(rows)).not.toMatch(/@workspace\.test|911 000/);
      expect(typeof rows[0]!.assignedBy?.displayName).toBe("string");
      expect(rows[0]!.assignedBy).not.toHaveProperty("email");
      expect(rows[0]!.talent).not.toHaveProperty("email");
      expect(rows[0]!.talent).not.toHaveProperty("phone");

      const profile = await as(
        superAdmin,
        "get",
        `/api/v1/talents/${talentId}/assignments`,
      );
      expect(profile.status).toBe(200);
      expect(
        (profile.body as { id: string; workId: string }[]).map((row) => row.id),
      ).toContain(assignmentId);
    });

    it("updates and cancels from the event, and keeps the history visible from the event", async () => {
      const eventId = await createEvent();
      const talentId = await createTalent();
      const created = await as(
        superAdmin,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Support" });
      const assignmentId = (created.body as { id: string }).id;

      const updated = await as(
        superAdmin,
        "patch",
        `/api/v1/talents/${talentId}/assignments/EVENT/${assignmentId}`,
      ).send({ role: "Headliner" });
      expect(updated.status).toBe(200);

      const cancelled = await as(
        superAdmin,
        "post",
        `/api/v1/talents/${talentId}/assignments/EVENT/${assignmentId}/transition`,
      ).send({ status: "CANCELLED", reason: "Withdrew from the event" });
      expect(cancelled.status).toBe(200);

      const rows = (
        await as(superAdmin, "get", `/api/v1/events/${eventId}/talents`)
      ).body as EventTalentBody[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.role).toBe("Headliner");
      expect(rows[0]!.status).toBe("CANCELLED");
    });

    it("refuses an inactive talent and a duplicate active assignment", async () => {
      const eventId = await createEvent();
      const talentId = await createTalent();
      await as(superAdmin, "post", `/api/v1/events/${eventId}/talents`).send({
        talentId,
        role: "Lead",
      });

      const duplicate = await as(
        superAdmin,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Lead" });
      expect(duplicate.status).toBe(409);
      expect((duplicate.body as ProblemBody).code).toBe(
        "TALENT_ASSIGNMENT_DUPLICATE",
      );

      const inactiveTalent = await createTalent();
      await as(
        superAdmin,
        "post",
        `/api/v1/talents/${inactiveTalent}/transition`,
      ).send({ availability: "INACTIVE" });
      const inactive = await as(
        superAdmin,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId: inactiveTalent, role: "Lead" });
      expect(inactive.status).toBe(409);
      expect((inactive.body as ProblemBody).code).toBe("TALENT_INACTIVE");
    });

    it("denies a caller without event access on both reads and writes", async () => {
      const eventId = await createEvent();
      const talentId = await createTalent();
      const read = await as(
        plainUser,
        "get",
        `/api/v1/events/${eventId}/talents`,
      );
      expect(read.status).toBe(403);
      const write = await as(
        plainUser,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Lead" });
      expect(write.status).toBe(403);
    });
  });

  describe("Admin event management", () => {
    async function eventRow(deptId: string): Promise<string> {
      const workspace = await prisma.workspace.create({
        data: { kind: "EVENT" },
      });
      const event = await prisma.event.create({
        data: {
          workspaceId: workspace.id,
          name: `Admin scope ${rand()}`,
          eventType: "CONCERT",
          departmentId: deptId,
        },
      });
      return event.id;
    }

    it("manages events in every department, and can delete them", async () => {
      const admin = await createPrincipal(
        `admin-ev-${rand()}@workspace.test`,
        "Admin",
        departmentId,
      );
      const marketing =
        (await prisma.department.findFirst({
          where: { name: "Marketing" },
        })) ??
        (await prisma.department.create({ data: { name: "Marketing" } }));
      const production = await eventRow(departmentId);
      const elsewhere = await eventRow(marketing.id);

      const list = await as(admin, "get", "/api/v1/events?pageSize=100");
      expect(list.status).toBe(200);
      const ids = (list.body as { items: { id: string }[] }).items.map(
        (item) => item.id,
      );
      expect(ids).toEqual(expect.arrayContaining([production, elsewhere]));

      const created = await as(admin, "post", "/api/v1/events").send({
        name: `Admin created ${rand()}`,
        eventType: "CONCERT",
      });
      expect(created.status).toBe(201);

      const edited = await as(
        admin,
        "patch",
        `/api/v1/events/${elsewhere}`,
      ).send({ name: `Renamed ${rand()}` });
      expect(edited.status).toBe(200);

      const teamId = await createTeam();
      const assigned = await as(
        admin,
        "put",
        `/api/v1/events/${elsewhere}/teams/${teamId}`,
      );
      expect(assigned.status).toBe(200);

      const removed = await as(admin, "delete", `/api/v1/events/${elsewhere}`);
      expect([200, 204]).toContain(removed.status);
    });

    it("reads and sets event budgets in every department", async () => {
      const admin = await createPrincipal(
        `admin-bud-${rand()}@workspace.test`,
        "Admin",
        departmentId,
      );
      const eventId = await eventRow(departmentId);
      const read = await as(admin, "get", `/api/v1/events/${eventId}/budget`);
      expect(read.status).toBe(200);
      const write = await as(
        admin,
        "put",
        `/api/v1/events/${eventId}/budget`,
      ).send({ amount: 1000, currency: "ETB" });
      expect(write.status).toBe(200);
    });

    it("manages events without any department, as Admin is exempt from the department requirement", async () => {
      const admin = await createPrincipal(
        `admin-nodept-${rand()}@workspace.test`,
        "Admin",
        null,
      );
      const eventId = await eventRow(departmentId);
      const list = await as(admin, "get", "/api/v1/events?pageSize=100");
      expect(list.status).toBe(200);
      expect(
        (list.body as { items: { id: string }[] }).items.map((item) => item.id),
      ).toContain(eventId);
      const edited = await as(admin, "patch", `/api/v1/events/${eventId}`).send(
        { name: `No dept ${rand()}` },
      );
      expect(edited.status).toBe(200);
    });

    it("keeps Department Manager event visibility inside their own department", async () => {
      const manager = await createPrincipal(
        `dm-scope-${rand()}@workspace.test`,
        "Department Manager",
        departmentId,
      );
      const marketing =
        (await prisma.department.findFirst({
          where: { name: "Marketing" },
        })) ??
        (await prisma.department.create({ data: { name: "Marketing" } }));
      const own = await eventRow(departmentId);
      const elsewhere = await eventRow(marketing.id);

      const list = await as(manager, "get", "/api/v1/events?pageSize=100");
      const ids = (list.body as { items: { id: string }[] }).items.map(
        (item) => item.id,
      );
      expect(ids).toContain(own);
      expect(ids).not.toContain(elsewhere);
    });

    it("restores the event grants on an existing Admin role when the seed runs", async () => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: "Admin" },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionKey: { startsWith: "event." } },
      });
      const before = await prisma.rolePermission.findMany({
        where: { roleId: role.id, permissionKey: { startsWith: "event." } },
      });
      expect(before).toHaveLength(0);

      await seedRbac(prisma);

      const after = await prisma.rolePermission.findMany({
        where: { roleId: role.id, permissionKey: { startsWith: "event." } },
      });
      const keys = after.map((grant) => grant.permissionKey);
      expect(keys).toEqual(
        expect.arrayContaining([
          "event.create",
          "event.read",
          "event.update",
          "event.delete",
          "event.assign_teams",
          "event.transition_status",
        ]),
      );
      expect(keys).toEqual(
        expect.arrayContaining(["event.budget.read", "event.budget.update"]),
      );
      expect(after.every((grant) => grant.scope === "ORGANIZATION")).toBe(true);
    });
  });

  describe("Production Manager assignment path", () => {
    async function eventIn(deptId: string): Promise<string> {
      const workspace = await prisma.workspace.create({
        data: { kind: "EVENT" },
      });
      const event = await prisma.event.create({
        data: {
          workspaceId: workspace.id,
          name: `PM event ${rand()}`,
          eventType: "CONCERT",
          departmentId: deptId,
        },
      });
      return event.id;
    }

    it("assigns talent to events in the Production department only, and names staff without email", async () => {
      // Production is the platform Production department, so this Department
      // Manager is a Production Manager with event.update in their own department.
      const productionManager = await createPrincipal(
        `pm-${rand()}@workspace.test`,
        "Department Manager",
        departmentId,
      );
      const marketing =
        (await prisma.department.findFirst({ where: { name: "Marketing" } })) ??
        (await prisma.department.create({ data: { name: "Marketing" } }));
      const ownEvent = await eventIn(departmentId);
      const otherEvent = await eventIn(marketing.id);
      const talentId = await createTalent();

      const created = await as(
        productionManager,
        "post",
        `/api/v1/events/${ownEvent}/talents`,
      ).send({ talentId, role: "Headliner" });
      expect(created.status).toBe(201);
      expect(JSON.stringify(created.body)).not.toMatch(/@workspace\.test/);

      const denied = await as(
        productionManager,
        "post",
        `/api/v1/events/${otherEvent}/talents`,
      ).send({ talentId, role: "Headliner" });
      expect(denied.status).toBe(403);

      const listed = await as(
        productionManager,
        "get",
        `/api/v1/events/${ownEvent}/talents`,
      );
      expect(listed.status).toBe(200);
      expect(JSON.stringify(listed.body)).not.toMatch(
        /@workspace\.test|911 000/,
      );
      expect(
        (listed.body as EventTalentBody[]).map((row) => row.talent.id),
      ).toEqual([talentId]);
    });
  });

  describe("department scope for each role", () => {
    async function eventIn(deptId: string): Promise<string> {
      const workspace = await prisma.workspace.create({
        data: { kind: "EVENT" },
      });
      const event = await prisma.event.create({
        data: {
          workspaceId: workspace.id,
          name: `Scoped event ${rand()}`,
          eventType: "CONCERT",
          departmentId: deptId,
        },
      });
      return event.id;
    }

    it("a department manager sees members only for teams in their own department", async () => {
      const manager = await createPrincipal(
        `dm-${rand()}@workspace.test`,
        "Department Manager",
        departmentId,
      );
      const eventId = await eventIn(departmentId);
      const ownTeam = await createTeam();
      const otherDepartment = (
        (await prisma.department.findFirst({ where: { name: "Marketing" } })) ??
        (await prisma.department.create({ data: { name: "Marketing" } }))
      ).id;
      const otherTeamRes = await as(superAdmin, "post", "/api/v1/teams").send({
        name: `Other team ${rand()}`,
        departmentId: otherDepartment,
      });
      const otherTeam = (otherTeamRes.body as { id: string }).id;
      const member = await createUser();
      await as(superAdmin, "put", `/api/v1/teams/${ownTeam}/members/${member}`);
      await as(
        superAdmin,
        "put",
        `/api/v1/teams/${otherTeam}/members/${member}`,
      );
      await as(superAdmin, "put", `/api/v1/events/${eventId}/teams/${ownTeam}`);
      await as(
        superAdmin,
        "put",
        `/api/v1/events/${eventId}/teams/${otherTeam}`,
      );

      const response = await as(
        manager,
        "get",
        `/api/v1/events/${eventId}/teams`,
      );
      expect(response.status).toBe(200);
      const teams = response.body as EventTeamBody[];
      const own = teams.find((team) => team.id === ownTeam)!;
      const other = teams.find((team) => team.id === otherTeam)!;
      expect(own.membersVisible).toBe(true);
      expect(own.members.map((m) => m.id)).toEqual([member]);
      expect(other.membersVisible).toBe(false);
      expect(other.members).toEqual([]);
    });

    it("a department member cannot read or assign talent on the event", async () => {
      const memberPrincipal = await createPrincipal(
        `mem-${rand()}@workspace.test`,
        "Department Member",
        departmentId,
      );
      const eventId = await eventIn(departmentId);
      const talentId = await createTalent();

      const read = await as(
        memberPrincipal,
        "get",
        `/api/v1/events/${eventId}/talents`,
      );
      expect(read.status).not.toBe(200);
      const write = await as(
        memberPrincipal,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Lead" });
      expect(write.status).not.toBe(201);
    });

    it("a department manager without talent grants cannot read or assign talent on their own event", async () => {
      // Marketing is not the Production department, so this manager is not a
      // Production Manager and holds no talent grants.
      const marketing =
        (await prisma.department.findFirst({ where: { name: "Marketing" } })) ??
        (await prisma.department.create({ data: { name: "Marketing" } }));
      const manager = await createPrincipal(
        `dm2-${rand()}@workspace.test`,
        "Department Manager",
        marketing.id,
      );
      const eventId = await eventIn(marketing.id);
      const talentId = await createTalent();

      const read = await as(
        manager,
        "get",
        `/api/v1/events/${eventId}/talents`,
      );
      expect(read.status).toBe(403);
      const write = await as(
        manager,
        "post",
        `/api/v1/events/${eventId}/talents`,
      ).send({ talentId, role: "Lead" });
      expect(write.status).toBe(403);
    });
  });
});
