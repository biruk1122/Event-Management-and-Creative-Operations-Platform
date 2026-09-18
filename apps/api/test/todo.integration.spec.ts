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
  userId: string;
}

interface TodoBody {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  relatedEventId: string | null;
  relatedProjectId: string | null;
  reminderEnabled: boolean;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function cookies(response: request.Response): string[] {
  const value = response.headers["set-cookie"] as unknown;
  return Array.isArray(value) ? (value as string[]) : [];
}

function csrfToken(values: string[]): string {
  const cookie = values.find((value) => value.startsWith("csrf_token="));
  const token = cookie?.slice("csrf_token=".length).split(";")[0];
  if (!token) throw new Error("CSRF token missing");
  return token;
}

describe("personal to-do and reminders API", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let owner: Principal;
  let other: Principal;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "todo-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "todo-refresh-token-secret-at-least-32-characters";
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
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function createPrincipal(email: string): Promise<Principal> {
      const user = await prisma.user.create({
        data: { email, credential: { create: { passwordHash: hash } } },
      });
      const login = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      const values = cookies(login);
      return { cookies: values, csrfToken: csrfToken(values), userId: user.id };
    }

    owner = await createPrincipal("todo-owner@example.test");
    other = await createPrincipal("todo-other@example.test");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "patch" | "delete",
    path: string,
  ) {
    const result = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? result
      : result.set("x-csrf-token", principal.csrfToken);
  }

  it("creates, lists, updates, and deletes a caller-owned to-do", async () => {
    const created = await as(owner, "post", "/api/v1/todos").send({
      title: "  Confirm venue  ",
      description: "  Call the venue manager  ",
      type: "WORK",
      dueDate: "2026-05-02",
      dueTime: "09:00",
      reminderAt: "2026-05-01T09:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const todo = created.body as TodoBody;
    expect(todo).toMatchObject({
      title: "Confirm venue",
      description: "Call the venue manager",
      type: "WORK",
      priority: "MEDIUM",
      status: "NOT_STARTED",
      dueDate: "2026-05-02",
      dueTime: "09:00:00",
      reminderEnabled: true,
      reminderAt: "2026-05-01T09:00:00.000Z",
    });

    const list = await as(owner, "get", "/api/v1/todos?type=WORK");
    expect(list.status).toBe(200);
    expect(
      (list.body as { items: TodoBody[] }).items.map(({ id }) => id),
    ).toContain(todo.id);

    const patched = await as(owner, "patch", `/api/v1/todos/${todo.id}`).send({
      status: "COMPLETED",
      reminderAt: null,
    });
    expect(patched.status).toBe(200);
    expect(patched.body as TodoBody).toMatchObject({
      status: "COMPLETED",
      reminderEnabled: false,
      reminderAt: null,
      // Untouched fields survive a partial update.
      title: "Confirm venue",
      dueDate: "2026-05-02",
    });

    expect((await as(owner, "delete", `/api/v1/todos/${todo.id}`)).status).toBe(
      204,
    );
    expect((await as(owner, "get", `/api/v1/todos/${todo.id}`)).status).toBe(
      404,
    );
  });

  it("keeps to-dos private and reports stable validation and schedule errors", async () => {
    const personal = await prisma.todo.create({
      data: { userId: owner.userId, title: "Private" },
    });
    expect(
      (await as(other, "get", `/api/v1/todos/${personal.id}`)).status,
    ).toBe(404);
    expect(
      (
        await as(other, "patch", `/api/v1/todos/${personal.id}`).send({
          title: "Hijacked",
        })
      ).status,
    ).toBe(404);
    expect(
      (await as(other, "delete", `/api/v1/todos/${personal.id}`)).status,
    ).toBe(404);

    const blankTitle = await as(owner, "post", "/api/v1/todos").send({
      title: "   ",
    });
    expect(blankTitle.status).toBe(400);
    expect(blankTitle.body).toMatchObject({ code: "VALIDATION_ERROR" });

    const timeWithoutDate = await as(owner, "post", "/api/v1/todos").send({
      title: "Needs a date",
      dueTime: "09:00",
    });
    expect(timeWithoutDate.status).toBe(400);
    expect(timeWithoutDate.body).toMatchObject({
      code: "TODO_SCHEDULE_INVALID",
    });

    const badEventRef = await as(owner, "post", "/api/v1/todos").send({
      title: "Dangling reference",
      relatedEventId: "00000000-0000-0000-0000-000000000000",
    });
    expect(badEventRef.status).toBe(400);
    expect(badEventRef.body).toMatchObject({
      code: "TODO_RELATED_EVENT_NOT_FOUND",
    });
  });

  it("enforces authentication and CSRF before to-do mutations", async () => {
    expect((await request(http).get("/api/v1/todos")).status).toBe(401);

    const missingCsrf = await request(http)
      .post("/api/v1/todos")
      .set("Cookie", owner.cookies)
      .send({ title: "No CSRF" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body).toMatchObject({ code: "CSRF_TOKEN_INVALID" });
  });

  it("requires the exact SELF grant after the transport guard accepts the key", async () => {
    await prisma.baselineGrant.delete({
      where: {
        permissionKey_scope: { permissionKey: "todo.create", scope: "SELF" },
      },
    });
    await prisma.baselineGrant.create({
      data: { permissionKey: "todo.create", scope: "DEPARTMENT" },
    });

    try {
      const response = await as(owner, "post", "/api/v1/todos").send({
        title: "Wrong scope",
      });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      await prisma.baselineGrant.delete({
        where: {
          permissionKey_scope: {
            permissionKey: "todo.create",
            scope: "DEPARTMENT",
          },
        },
      });
      await prisma.baselineGrant.create({
        data: { permissionKey: "todo.create", scope: "SELF" },
      });
    }
  });

  it("filters by due-date range and relates an existing event as optional context", async () => {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: { workspaceId: workspace.id, name: "Launch", eventType: "CONCERT" },
    });

    const [inRange, outOfRange] = await Promise.all([
      prisma.todo.create({
        data: {
          userId: owner.userId,
          title: "In range",
          dueDate: new Date("2026-06-10"),
          relatedEventId: event.id,
        },
      }),
      prisma.todo.create({
        data: {
          userId: owner.userId,
          title: "Out of range",
          dueDate: new Date("2026-07-10"),
        },
      }),
    ]);

    const filtered = await as(
      owner,
      "get",
      "/api/v1/todos?dueFrom=2026-06-01&dueTo=2026-06-30",
    );
    expect(filtered.status).toBe(200);
    const ids = (filtered.body as { items: TodoBody[] }).items.map(
      ({ id }) => id,
    );
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(outOfRange.id);

    const withEvent = (filtered.body as { items: TodoBody[] }).items.find(
      (item) => item.id === inRange.id,
    );
    expect(withEvent?.relatedEventId).toBe(event.id);

    // Deleting the event only clears the reference - the to-do survives,
    // matching Project.event's own soft-reference semantics.
    await prisma.event.delete({ where: { id: event.id } });
    const afterEventRemoval = await as(
      owner,
      "get",
      `/api/v1/todos/${inRange.id}`,
    );
    expect(afterEventRemoval.status).toBe(200);
    expect((afterEventRemoval.body as TodoBody).relatedEventId).toBeNull();
  });
});
