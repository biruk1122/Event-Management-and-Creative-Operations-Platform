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

interface CalendarEntryBody {
  id: string;
  title: string;
  description: string | null;
  type: "EVENT" | "TASK" | "PROJECT" | "PERSONAL" | "REMINDER";
  startAt: string;
  endAt: string | null;
  eventId: string | null;
  taskId: string | null;
  projectId: string | null;
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

describe("calendar and personal schedules API", () => {
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
      "calendar-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "calendar-refresh-token-secret-at-least-32-chars";
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

    owner = await createPrincipal("calendar-owner@example.test");
    other = await createPrincipal("calendar-other@example.test");
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

  it("creates, filters, updates, and deletes a caller-owned reminder", async () => {
    const created = await as(owner, "post", "/api/v1/calendar").send({
      title: "  Send venue reminder  ",
      description: "  Confirm access  ",
      type: "REMINDER",
      startAt: "2026-05-02T09:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const entry = created.body as CalendarEntryBody;
    expect(entry).toMatchObject({
      title: "Send venue reminder",
      description: "Confirm access",
      type: "REMINDER",
      endAt: null,
      eventId: null,
    });

    const list = await as(
      owner,
      "get",
      "/api/v1/calendar?from=2026-05-01T00:00:00.000Z&to=2026-05-03T00:00:00.000Z&type=REMINDER",
    );
    expect(list.status).toBe(200);
    expect(
      (list.body as { items: CalendarEntryBody[] }).items.map(({ id }) => id),
    ).toContain(entry.id);

    const patched = await as(
      owner,
      "patch",
      `/api/v1/calendar/${entry.id}`,
    ).send({
      description: null,
      endAt: "2026-05-02T10:00:00.000Z",
    });
    expect(patched.status).toBe(200);
    expect(patched.body as CalendarEntryBody).toMatchObject({
      description: null,
      endAt: "2026-05-02T10:00:00.000Z",
    });

    expect(
      (await as(owner, "delete", `/api/v1/calendar/${entry.id}`)).status,
    ).toBe(204);
    expect(
      (await as(owner, "get", `/api/v1/calendar/${entry.id}`)).status,
    ).toBe(404);
  });

  it("keeps entries private, read-only source projections immutable, and invalid requests stable", async () => {
    const personal = await prisma.calendarEntry.create({
      data: {
        userId: owner.userId,
        title: "Private",
        type: "PERSONAL",
        startAt: new Date("2026-05-04T09:00:00.000Z"),
      },
    });
    expect(
      (await as(other, "get", `/api/v1/calendar/${personal.id}`)).status,
    ).toBe(404);

    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: { workspaceId: workspace.id, name: "Source", eventType: "CONCERT" },
    });
    const projection = await prisma.calendarEntry.create({
      data: {
        userId: owner.userId,
        title: "Source",
        type: "EVENT",
        startAt: new Date("2026-05-04T10:00:00.000Z"),
        eventId: event.id,
      },
    });
    const projectionPatch = await as(
      owner,
      "patch",
      `/api/v1/calendar/${projection.id}`,
    ).send({ title: "Changed" });
    expect(projectionPatch.status).toBe(404);
    expect(projectionPatch.body).toMatchObject({
      code: "CALENDAR_ENTRY_NOT_FOUND",
    });
    expect(
      (await as(owner, "delete", `/api/v1/calendar/${projection.id}`)).status,
    ).toBe(404);

    for (const payload of [
      { title: "   ", type: "PERSONAL", startAt: "2026-05-05T09:00:00.000Z" },
      { title: "Valid", type: "EVENT", startAt: "2026-05-05T09:00:00.000Z" },
    ]) {
      const response = await as(owner, "post", "/api/v1/calendar").send(
        payload,
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    const range = await as(
      owner,
      "get",
      "/api/v1/calendar?from=2026-01-01T00:00:00.000Z&to=2026-04-02T00:00:00.000Z",
    );
    expect(range.status).toBe(400);
    expect(range.body).toMatchObject({ code: "CALENDAR_RANGE_INVALID" });
  });
});
