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

interface Principal {
  cookies: string[];
  csrfToken: string;
  userId: string;
}

interface ProblemBody {
  code: string;
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
 * Archived events, productions and campaigns take no new links, and an existing
 * link to archived work is kept rather than broken by unrelated edits.
 */
describe("archived work items take no new links", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let superAdmin: Principal;
  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "archived-links-access-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "archived-links-refresh-secret-at-least-32-chars";
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
      .useValue({
        createUploadGrant: () => ({
          fields: {},
          url: "https://storage.test/upload",
        }),
        readObject: () => Promise.resolve(null),
        createDownloadGrant: () => ({
          expiresAt: new Date(),
          url: "https://storage.test/x",
        }),
        deleteObject: () => Promise.resolve(),
      })
      .overrideProvider(FILE_SCANNER)
      .useValue({ scan: () => Promise.resolve("clean") })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    departmentId = (
      await prisma.department.create({
        data: { name: "Archive Links Department" },
      })
    ).id;
    const user = await prisma.user.create({
      data: {
        email: "super-admin@archived-links.test",
        firstName: "Super",
        credential: { create: { passwordHash: credentialHash } },
      },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: role.id },
    });
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookies = setCookies(login);
    superAdmin = {
      cookies,
      csrfToken: cookieValue(cookies, "csrf_token"),
      userId: user.id,
    };
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "put" | "patch",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function archivedEvent(name: string): Promise<string> {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name,
        eventType: "CONCERT",
        departmentId,
        archivedAt: new Date(),
      },
    });
    return event.id;
  }

  async function activeEvent(name: string): Promise<string> {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name,
        eventType: "CONCERT",
        departmentId,
      },
    });
    return event.id;
  }

  it("refuses a new task link to an archived event, and accepts an active one", async () => {
    const archived = await archivedEvent("Archived gala");
    const active = await activeEvent("Active gala");

    const refused = await as(superAdmin, "post", "/api/v1/tasks").send({
      title: "Book the venue",
      departmentId,
      relatedEventId: archived,
    });
    expect(refused.status).toBe(400);
    expect((refused.body as ProblemBody).code).toBe("TASK_RELATED_NOT_FOUND");

    const accepted = await as(superAdmin, "post", "/api/v1/tasks").send({
      title: "Book the venue",
      departmentId,
      relatedEventId: active,
    });
    expect(accepted.status).toBe(201);
  });

  it("keeps an existing archived task link on unrelated edits, and refuses moving it to another archived event", async () => {
    const archived = await archivedEvent("Old gala");
    const otherArchived = await archivedEvent("Other old gala");
    const task = await prisma.task.create({
      data: {
        title: "Historic task",
        departmentId,
        relatedEventId: archived,
        taskNumber: 900001,
      },
    });

    const renamed = await as(
      superAdmin,
      "patch",
      `/api/v1/tasks/${task.id}`,
    ).send({
      title: "Historic task, renamed",
      relatedEventId: archived,
    });
    expect(renamed.status).toBe(200);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .relatedEventId,
    ).toBe(archived);

    const moved = await as(
      superAdmin,
      "patch",
      `/api/v1/tasks/${task.id}`,
    ).send({
      relatedEventId: otherArchived,
    });
    expect(moved.status).toBe(400);
    expect((moved.body as ProblemBody).code).toBe("TASK_RELATED_NOT_FOUND");
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .relatedEventId,
    ).toBe(archived);
  });

  it("keeps a production's archived event link on unrelated edits", async () => {
    const archived = await archivedEvent("Production parent");
    const workspace = await prisma.workspace.create({
      data: { kind: "PRODUCTION" },
    });
    const production = await prisma.production.create({
      data: {
        workspaceId: workspace.id,
        name: "Linked production",
        productionType: "Video",
        departmentId,
        eventId: archived,
      },
    });

    const edited = await as(
      superAdmin,
      "patch",
      `/api/v1/productions/${production.id}`,
    ).send({
      name: "Linked production, edited",
      eventId: archived,
    });
    expect(edited.status).toBe(200);
    expect(
      (
        await prisma.production.findUniqueOrThrow({
          where: { id: production.id },
        })
      ).eventId,
    ).toBe(archived);
  });

  it("refuses a new production link to an archived event", async () => {
    const archived = await archivedEvent("Closed parent");
    const workspace = await prisma.workspace.create({
      data: { kind: "PRODUCTION" },
    });
    const production = await prisma.production.create({
      data: {
        workspaceId: workspace.id,
        name: "Unlinked production",
        productionType: "Video",
        departmentId,
      },
    });

    const refused = await as(
      superAdmin,
      "patch",
      `/api/v1/productions/${production.id}`,
    ).send({
      eventId: archived,
    });
    // An archived event reads as absent to a new link, the same as an unknown id.
    expect(refused.status).toBe(404);
    expect((refused.body as ProblemBody).code).toBe("EVENT_NOT_FOUND");
    expect(
      (
        await prisma.production.findUniqueOrThrow({
          where: { id: production.id },
        })
      ).eventId,
    ).toBeNull();
  });
});
