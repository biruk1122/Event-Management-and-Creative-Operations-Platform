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
const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const RESPONSE_KEYS = [
  "createdAt",
  "createdBy",
  "deadlineAt",
  "departmentId",
  "description",
  "endAt",
  "eventId",
  "id",
  "manager",
  "name",
  "participants",
  "productionType",
  "startAt",
  "status",
  "talents",
  "teams",
  "updatedAt",
  "workspaceId",
].sort();

interface Principal {
  cookies: string[];
  csrfToken: string;
}
interface ProductionBody {
  id: string;
  workspaceId: string;
  name: string;
  productionType: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  status: string;
  eventId: string | null;
  departmentId: string | null;
  manager: { id: string } | null;
  teams: { id: string; name: string }[];
  participants: { id: string }[];
  talents: { id: string; role: string; talent: { id: string } }[];
  createdBy: { id: string } | null;
  createdAt: string;
  updatedAt: string;
}
interface PageBody {
  items: ProductionBody[];
  page: number;
  pageSize: number;
  total: number;
}
interface ProblemBody {
  code: string;
  status: number;
}

function body<T>(response: request.Response): T {
  return response.body as T;
}
function cookieValue(response: request.Response, name: string): string {
  const raw = response.headers["set-cookie"] as string[] | undefined;
  const value = raw
    ?.find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .split(";")[0];
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

describe("production management API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let admin: Principal;
  let plain: Principal;
  let manager: Principal;
  let otherManager: Principal;
  let adminId: string;
  let departmentId: string;
  let otherDepartmentId: string;
  let sequence = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "productions-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "productions-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
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
    const hash = await new PasswordHasher().hash(PASSWORD);
    adminId = (
      await prisma.user.create({
        data: {
          email: "admin@productions.test",
          credential: { create: { passwordHash: hash } },
        },
      })
    ).id;
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, roleId: role.id },
    });
    await prisma.user.create({
      data: {
        email: "plain@productions.test",
        credential: { create: { passwordHash: hash } },
      },
    });
    // `Production` and `Marketing` are two of the platform's fixed, supported
    // department names (`PLATFORM_DEPARTMENTS`); a department manager's
    // grants are otherwise constrained to profile-only (see
    // `department-access.policy.ts#constrainDepartmentGrants`).
    departmentId = (
      await prisma.department.create({ data: { name: "Production" } })
    ).id;
    otherDepartmentId = (
      await prisma.department.create({ data: { name: "Marketing" } })
    ).id;
    const managerRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Department Manager" },
    });
    await prisma.user.create({
      data: {
        email: "manager@productions.test",
        departmentId,
        credential: { create: { passwordHash: hash } },
        roleAssignment: { create: { roleId: managerRole.id } },
      },
    });
    await prisma.user.create({
      data: {
        email: "other-manager@productions.test",
        departmentId: otherDepartmentId,
        credential: { create: { passwordHash: hash } },
        roleAssignment: { create: { roleId: managerRole.id } },
      },
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    http = app.getHttpServer();
    async function login(email: string): Promise<Principal> {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      return {
        cookies: response.headers["set-cookie"] as unknown as string[],
        csrfToken: cookieValue(response, "csrf_token"),
      };
    }
    admin = await login("admin@productions.test");
    plain = await login("plain@productions.test");
    manager = await login("manager@productions.test");
    otherManager = await login("other-manager@productions.test");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "patch" | "put" | "delete",
    path: string,
  ) {
    const call = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? call
      : call.set("x-csrf-token", principal.csrfToken);
  }
  async function create(
    input: Record<string, unknown> = {},
  ): Promise<ProductionBody> {
    const response = await as(admin, "post", "/api/v1/productions").send({
      name: `Production ${++sequence}`,
      productionType: "Video",
      ...input,
    });
    expect(response.status).toBe(201);
    return body<ProductionBody>(response);
  }

  it("enforces authentication, CSRF, and organization permissions", async () => {
    expect((await request(http).get("/api/v1/productions")).status).toBe(401);
    const csrf = await request(http)
      .post("/api/v1/productions")
      .set("Cookie", admin.cookies)
      .send({ name: "X", productionType: "Video" });
    expect(csrf.status).toBe(403);
    const before = await prisma.production.count();
    const denied = await as(plain, "post", "/api/v1/productions").send({
      name: "X",
      productionType: "Video",
    });
    expect(denied.status).toBe(403);
    expect(body<ProblemBody>(denied).code).toBe("PERMISSION_DENIED");
    expect((await as(plain, "get", "/api/v1/productions")).status).toBe(403);
    expect(await prisma.production.count()).toBe(before);
  });

  it("validates create payloads and rolls back an unknown manager", async () => {
    for (const payload of [
      { name: " ", productionType: "Video" },
      { name: "Video", productionType: " " },
      { name: "Video", productionType: "Video", startAt: "not-a-date" },
      { name: "Video", productionType: "Video", managerId: "not-a-uuid" },
    ]) {
      const response = await as(admin, "post", "/api/v1/productions").send(
        payload,
      );
      expect(response.status).toBe(400);
    }
    const productions = await prisma.production.count();
    const workspaces = await prisma.workspace.count();
    const missing = await as(admin, "post", "/api/v1/productions").send({
      name: "Ghost",
      productionType: "Video",
      managerId: MISSING_ID,
    });
    expect(missing.status).toBe(404);
    expect(body<ProblemBody>(missing).code).toBe("USER_NOT_FOUND");
    expect(await prisma.production.count()).toBe(productions);
    expect(await prisma.workspace.count()).toBe(workspaces);
  });

  it("creates and reads a production with a connected workspace and stable response", async () => {
    const created = await create({
      name: "Launch film",
      description: "  First cut  ",
      startAt: "2026-10-01T00:00:00.000Z",
      endAt: "2026-10-02T00:00:00.000Z",
      deadlineAt: "2026-10-03T00:00:00.000Z",
    });
    expect(created).toMatchObject({
      name: "Launch film",
      productionType: "Video",
      description: "First cut",
      status: "PLANNED",
      startAt: "2026-10-01T00:00:00.000Z",
      deadlineAt: "2026-10-03T00:00:00.000Z",
      manager: null,
      teams: [],
      participants: [],
      talents: [],
      createdBy: { id: adminId },
    });
    expect(Object.keys(created).sort()).toEqual(RESPONSE_KEYS);
    expect(
      (
        await prisma.workspace.findUniqueOrThrow({
          where: { id: created.workspaceId },
        })
      ).kind,
    ).toBe("PRODUCTION");
    const found = await as(admin, "get", `/api/v1/productions/${created.id}`);
    expect(found.status).toBe(200);
    expect(body<ProductionBody>(found)).toEqual(created);
    const missing = await as(
      admin,
      "get",
      `/api/v1/productions/${MISSING_ID}`,
    ).set("x-request-id", "production-missing");
    expect(missing.status).toBe(404);
    expect(body<ProblemBody>(missing).code).toBe("PRODUCTION_NOT_FOUND");
    expect(missing.headers["x-request-id"]).toBe("production-missing");
  });

  it("filters and paginates the production list deterministically", async () => {
    const marker = `Filter ${++sequence}`;
    const first = await create({ name: `${marker} A` });
    const second = await create({ name: `${marker} B` });
    const one = await as(
      admin,
      "get",
      `/api/v1/productions?search=${encodeURIComponent(marker)}&page=1&pageSize=1`,
    );
    expect(one.status).toBe(200);
    expect(body<PageBody>(one)).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
    });
    expect(body<PageBody>(one).items).toHaveLength(1);
    const two = await as(
      admin,
      "get",
      `/api/v1/productions?search=${encodeURIComponent(marker)}&page=2&pageSize=1`,
    );
    expect(body<PageBody>(two).items).toHaveLength(1);
    expect(
      [
        body<PageBody>(one).items[0]?.id,
        body<PageBody>(two).items[0]?.id,
      ].sort(),
    ).toEqual([first.id, second.id].sort());
    const repeat = await as(
      admin,
      "get",
      `/api/v1/productions?search=${encodeURIComponent(marker)}&page=1&pageSize=1`,
    );
    expect(body<PageBody>(repeat).items[0]?.id).toBe(
      body<PageBody>(one).items[0]?.id,
    );
    const invalid = await as(admin, "get", "/api/v1/productions?pageSize=101");
    expect(invalid.status).toBe(400);
  });

  it("updates nullable fields and rejects reversed schedules", async () => {
    const created = await create({
      description: "Initial",
      startAt: "2026-11-02T00:00:00.000Z",
    });
    const invalid = await as(
      admin,
      "patch",
      `/api/v1/productions/${created.id}`,
    ).send({ endAt: "2026-11-01T00:00:00.000Z" });
    expect(invalid.status).toBe(400);
    expect(body<ProblemBody>(invalid).code).toBe("PRODUCTION_SCHEDULE_INVALID");
    const updated = await as(
      admin,
      "patch",
      `/api/v1/productions/${created.id}`,
    ).send({
      name: "Renamed",
      description: null,
      deadlineAt: "2026-11-03T00:00:00.000Z",
    });
    expect(updated.status).toBe(200);
    expect(body<ProductionBody>(updated)).toMatchObject({
      name: "Renamed",
      description: null,
      deadlineAt: "2026-11-03T00:00:00.000Z",
    });
  });

  it("enforces lifecycle transitions and terminal states", async () => {
    const created = await create();
    const path = `/api/v1/productions/${created.id}/transition`;
    const forbidden = await as(admin, "post", path).send({
      status: "COMPLETED",
    });
    expect(forbidden.status).toBe(409);
    expect(body<ProblemBody>(forbidden).code).toBe(
      "PRODUCTION_TRANSITION_INVALID",
    );
    expect(
      (await as(admin, "post", path).send({ status: "ACTIVE" })).status,
    ).toBe(200);
    expect(
      body<ProductionBody>(
        await as(admin, "post", path).send({ status: "COMPLETED" }),
      ).status,
    ).toBe("COMPLETED");
    expect(
      (await as(admin, "post", path).send({ status: "ACTIVE" })).status,
    ).toBe(409);
    expect(
      (await as(admin, "post", path).send({ status: "UNKNOWN" })).status,
    ).toBe(400);
  });

  it("reports missing association targets and invalid manager payloads", async () => {
    const created = await create();
    const root = `/api/v1/productions/${created.id}`;
    expect((await as(admin, "put", `${root}/manager`).send({})).status).toBe(
      400,
    );
    const manager = await as(admin, "put", `${root}/manager`).send({
      managerId: MISSING_ID,
    });
    expect(manager.status).toBe(404);
    expect(body<ProblemBody>(manager).code).toBe("USER_NOT_FOUND");
    const team = await as(admin, "put", `${root}/teams/${MISSING_ID}`);
    expect(team.status).toBe(404);
    expect(body<ProblemBody>(team).code).toBe("TEAM_NOT_FOUND");
    const participant = await as(
      admin,
      "put",
      `${root}/participants/${MISSING_ID}`,
    );
    expect(participant.status).toBe(404);
    expect(body<ProblemBody>(participant).code).toBe("USER_NOT_FOUND");
    const talent = await as(admin, "put", `${root}/talents/${MISSING_ID}`).send(
      { role: "Lead" },
    );
    expect(talent.status).toBe(404);
    expect(body<ProblemBody>(talent).code).toBe("TALENT_NOT_FOUND");
  });

  it("assigns manager, team, participant, and talent, then removes them", async () => {
    const created = await create();
    const user = await prisma.user.create({
      data: { email: `member-${++sequence}@productions.test` },
    });
    const team = await prisma.team.create({
      data: { name: `Crew ${++sequence}`, departmentId },
    });
    const talent = await prisma.talent.create({
      data: { fullName: `Artist ${++sequence}`, type: "ARTIST" },
    });
    const root = `/api/v1/productions/${created.id}`;
    expect(
      body<ProductionBody>(
        await as(admin, "put", `${root}/manager`).send({ managerId: user.id }),
      ).manager?.id,
    ).toBe(user.id);
    expect(
      body<ProductionBody>(
        await as(admin, "put", `${root}/teams/${team.id}`),
      ).teams.map((item) => item.id),
    ).toContain(team.id);
    expect(
      body<ProductionBody>(
        await as(admin, "put", `${root}/participants/${user.id}`),
      ).participants.map((item) => item.id),
    ).toContain(user.id);
    const assigned = await as(
      admin,
      "put",
      `${root}/talents/${talent.id}`,
    ).send({ role: "Lead" });
    expect(assigned.status).toBe(200);
    expect(body<ProductionBody>(assigned).talents[0]).toMatchObject({
      role: "Lead",
      talent: { id: talent.id },
    });
    const duplicate = await as(
      admin,
      "put",
      `${root}/talents/${talent.id}`,
    ).send({ role: "Lead" });
    expect(duplicate.status).toBe(409);
    expect(body<ProblemBody>(duplicate).code).toBe(
      "PRODUCTION_TALENT_ALREADY_ASSIGNED",
    );
    expect(
      (await as(admin, "delete", `${root}/talents/${talent.id}`)).status,
    ).toBe(200);
    expect(
      (await as(admin, "delete", `${root}/participants/${user.id}`)).status,
    ).toBe(200);
    expect((await as(admin, "delete", `${root}/teams/${team.id}`)).status).toBe(
      200,
    );
    expect(
      body<ProductionBody>(
        await as(admin, "put", `${root}/manager`).send({ managerId: null }),
      ).manager,
    ).toBeNull();
    const missing = await as(admin, "delete", `${root}/teams/${team.id}`);
    expect(missing.status).toBe(409);
    expect(body<ProblemBody>(missing).code).toBe(
      "PRODUCTION_TEAM_NOT_ASSIGNED",
    );
  });

  it("deletes a production and its workspace but retains related talent", async () => {
    const created = await create();
    const talent = await prisma.talent.create({
      data: { fullName: `Retained ${++sequence}`, type: "ARTIST" },
    });
    await as(
      admin,
      "put",
      `/api/v1/productions/${created.id}/talents/${talent.id}`,
    ).send({ role: "Lead" });
    expect(
      (await as(admin, "delete", `/api/v1/productions/${created.id}`)).status,
    ).toBe(204);
    expect(
      await prisma.workspace.findUnique({ where: { id: created.workspaceId } }),
    ).toBeNull();
    expect(
      await prisma.talent.findUnique({ where: { id: talent.id } }),
    ).not.toBeNull();
  });

  it("preserves a production when a connected task blocks deletion", async () => {
    const created = await create();
    const task = await prisma.task.create({
      data: { title: "Prepare set", workspaceId: created.workspaceId },
    });
    const response = await as(
      admin,
      "delete",
      `/api/v1/productions/${created.id}`,
    );
    expect(response.status).toBe(409);
    expect(body<ProblemBody>(response).code).toBe(
      "PRODUCTION_WORKSPACE_IN_USE",
    );
    expect(
      await prisma.production.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
    expect(
      await prisma.workspace.findUnique({ where: { id: created.workspaceId } }),
    ).not.toBeNull();
    await prisma.task.delete({ where: { id: task.id } });
  });

  it("scopes a Department Manager's productions to their own department", async () => {
    const own = await as(manager, "post", "/api/v1/productions").send({
      name: `Manager production ${++sequence}`,
      productionType: "Video",
    });
    expect(own.status).toBe(201);
    const ownProduction = body<ProductionBody & { departmentId: string }>(own);
    expect(ownProduction.departmentId).toBe(departmentId);

    // Visible to its own manager and to Super Admin, invisible to a
    // different department's manager.
    expect(
      (await as(manager, "get", `/api/v1/productions/${ownProduction.id}`))
        .status,
    ).toBe(200);
    expect(
      (await as(admin, "get", `/api/v1/productions/${ownProduction.id}`))
        .status,
    ).toBe(200);
    const deniedGet = await as(
      otherManager,
      "get",
      `/api/v1/productions/${ownProduction.id}`,
    );
    expect(deniedGet.status).toBe(403);
    expect(body<ProblemBody>(deniedGet).code).toBe("PERMISSION_DENIED");

    // A cross-department create attempt is rejected server-side, never
    // trusting the client-supplied departmentId.
    const crossDepartment = await as(
      manager,
      "post",
      "/api/v1/productions",
    ).send({
      name: "Cross-department attempt",
      productionType: "Video",
      departmentId: otherDepartmentId,
    });
    expect(crossDepartment.status).toBe(403);

    // The department manager's own list only contains their department's
    // productions.
    const list = await as(manager, "get", "/api/v1/productions?pageSize=100");
    expect(list.status).toBe(200);
    const ids = body<{ items: Array<{ id: string }> }>(list).items.map(
      (item) => item.id,
    );
    expect(ids).toContain(ownProduction.id);

    const otherList = await as(
      otherManager,
      "get",
      "/api/v1/productions?pageSize=100",
    );
    expect(
      body<{ items: Array<{ id: string }> }>(otherList).items.map(
        (item) => item.id,
      ),
    ).not.toContain(ownProduction.id);
  });

  it("gates the production budget behind its own sensitive keys and department scope", async () => {
    const created = await create();
    const ownProduction = await as(manager, "post", "/api/v1/productions").send(
      { name: `Budget production ${++sequence}`, productionType: "Video" },
    );
    expect(ownProduction.status).toBe(201);
    const productionId = body<ProductionBody>(ownProduction).id;

    const set = await as(
      manager,
      "put",
      `/api/v1/productions/${productionId}/budget`,
    ).send({ amount: 5000, currency: "USD" });
    expect(set.status).toBe(200);
    expect(body<{ amount: string; currency: string }>(set)).toEqual({
      amount: "5000.00",
      currency: "USD",
    });

    const read = await as(
      manager,
      "get",
      `/api/v1/productions/${productionId}/budget`,
    );
    expect(body<{ amount: string }>(read).amount).toBe("5000.00");

    const summary = await as(
      admin,
      "get",
      `/api/v1/productions/${productionId}/budget-summary`,
    );
    expect(summary.status).toBe(200);
    expect(body<{ linkedEventId: string | null }>(summary)).toMatchObject({
      plannedAmount: "5000.00",
      currency: "USD",
      actualApproved: "0.00",
      actualPending: "0.00",
      linkedEventId: null,
    });

    // Another department's manager cannot read or change this budget, even
    // though it is a different, sensitive permission key.
    const denied = await as(
      otherManager,
      "get",
      `/api/v1/productions/${productionId}/budget`,
    );
    expect(denied.status).toBe(403);

    // The admin-created production (no department) stays organization-only.
    const adminBudget = await as(
      manager,
      "get",
      `/api/v1/productions/${created.id}/budget`,
    );
    expect(adminBudget.status).toBe(403);
  });

  it("tracks approved and pending spend recorded directly against a production with no linked event", async () => {
    const ownProduction = await as(manager, "post", "/api/v1/productions").send(
      { name: `Direct expense production ${++sequence}`, productionType: "Video" },
    );
    expect(ownProduction.status).toBe(201);
    const productionId = body<ProductionBody>(ownProduction).id;
    expect(body<ProductionBody>(ownProduction).eventId).toBeNull();

    await as(manager, "put", `/api/v1/productions/${productionId}/budget`).send(
      { amount: 2000, currency: "USD" },
    );

    const approvedExpense = await as(manager, "post", "/api/v1/expenses").send(
      {
        productionId,
        category: "VENUE",
        description: "Rehearsal space",
        actualAmount: 500,
        currency: "USD",
      },
    );
    expect(approvedExpense.status).toBe(201);
    const approvedId = body<{ id: string; eventId: string | null }>(
      approvedExpense,
    ).id;
    expect(body<{ eventId: string | null }>(approvedExpense).eventId).toBeNull();
    await as(manager, "post", `/api/v1/expenses/${approvedId}/submit`);
    const approved = await as(
      admin,
      "post",
      `/api/v1/expenses/${approvedId}/reviews`,
    ).send({ outcome: "APPROVED" });
    expect(approved.status).toBe(200);

    const pendingExpense = await as(manager, "post", "/api/v1/expenses").send({
      productionId,
      category: "LOGISTICS",
      description: "Equipment transport",
      actualAmount: 150,
      currency: "USD",
    });
    expect(pendingExpense.status).toBe(201);
    await as(
      manager,
      "post",
      `/api/v1/expenses/${body<{ id: string }>(pendingExpense).id}/submit`,
    );

    const summary = await as(
      admin,
      "get",
      `/api/v1/productions/${productionId}/budget-summary`,
    );
    expect(summary.status).toBe(200);
    expect(
      body<{
        plannedAmount: string;
        actualApproved: string;
        actualPending: string;
        linkedEventId: string | null;
      }>(summary),
    ).toMatchObject({
      plannedAmount: "2000.00",
      actualApproved: "500.00",
      actualPending: "150.00",
      linkedEventId: null,
    });
  });

  it("manages production locations scoped to the parent production's authorization", async () => {
    const ownProduction = await as(manager, "post", "/api/v1/productions").send(
      { name: `Location production ${++sequence}`, productionType: "Video" },
    );
    expect(ownProduction.status).toBe(201);
    const productionId = body<ProductionBody>(ownProduction).id;

    const created = await as(
      manager,
      "post",
      `/api/v1/productions/${productionId}/locations`,
    ).send({ name: "Riverside Studio", address: "1 River Rd" });
    expect(created.status).toBe(201);
    const location = body<{ id: string; status: string }>(created);
    expect(location.status).toBe("PENDING");

    const updated = await as(
      manager,
      "patch",
      `/api/v1/productions/${productionId}/locations/${location.id}`,
    ).send({ status: "CONFIRMED" });
    expect(updated.status).toBe(200);
    expect(body<{ status: string }>(updated).status).toBe("CONFIRMED");

    const list = await as(
      manager,
      "get",
      `/api/v1/productions/${productionId}/locations`,
    );
    expect(body<{ items: unknown[] }>(list).items).toHaveLength(1);

    // A different department's manager cannot reach this production's
    // locations at all - authorization flows through the parent production.
    const deniedList = await as(
      otherManager,
      "get",
      `/api/v1/productions/${productionId}/locations`,
    );
    expect(deniedList.status).toBe(403);
    const deniedCreate = await as(
      otherManager,
      "post",
      `/api/v1/productions/${productionId}/locations`,
    ).send({ name: "Intruder location" });
    expect(deniedCreate.status).toBe(403);

    const deleted = await as(
      manager,
      "delete",
      `/api/v1/productions/${productionId}/locations/${location.id}`,
    );
    expect(deleted.status).toBe(204);
    expect(
      body<{ items: unknown[] }>(
        await as(
          manager,
          "get",
          `/api/v1/productions/${productionId}/locations`,
        ),
      ).items,
    ).toHaveLength(0);
  });
});
