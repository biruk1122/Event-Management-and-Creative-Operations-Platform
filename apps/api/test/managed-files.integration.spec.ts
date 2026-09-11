import { PrismaPg } from "@prisma/adapter-pg";
/* eslint-disable @typescript-eslint/require-await */
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  FILE_OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from "../src/file-management/storage/object-storage.js";
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

interface UploadIntentBody {
  id: string;
  upload: { fields: Record<string, string>; url: string };
}

interface ManagedFileBody {
  filename: string;
  id: string;
  mediaType: string;
  sizeBytes: number;
  state: string;
}

class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();

  async createUploadGrant(input: {
    key: string;
    mediaType: string;
    sizeBytes: number;
  }) {
    return {
      fields: { "Content-Type": input.mediaType, key: input.key },
      url: "https://storage.test/upload",
    };
  }

  async readObject(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async createDownloadGrant(input: {
    key: string;
    filename: string;
    mediaType: string;
  }) {
    return {
      expiresAt: new Date("2030-01-01T00:05:00.000Z"),
      url: `https://storage.test/download/${encodeURIComponent(input.key)}`,
    };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

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
  if (!value) throw new Error(`cookie ${name} not present`);
  return value;
}

describe("managed files API", () => {
  let app: NestExpressApplication;
  let db: IsolatedDatabase;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let prisma: PrismaClient;
  let storage: InMemoryObjectStorage;
  let superAdmin: Principal;
  let plainUser: Principal;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "managed-files-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "managed-files-refresh-token-secret-at-least-32";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";

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
    storage = new InMemoryObjectStorage();
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    async function login(email: string): Promise<Principal> {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD });
      expect(response.status).toBe(200);
      const cookies = setCookies(response);
      return { cookies, csrfToken: cookieValue(cookies, "csrf_token") };
    }
    const admin = await prisma.user.create({
      data: {
        email: "files-admin@test.local",
        credential: { create: { passwordHash: credentialHash } },
      },
    });
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    await prisma.userRoleAssignment.create({
      data: { roleId: superAdminRole.id, userId: admin.id },
    });
    await prisma.user.create({
      data: {
        email: "files-plain@test.local",
        credential: { create: { passwordHash: credentialHash } },
      },
    });
    superAdmin = await login("files-admin@test.local");
    plainUser = await login("files-plain@test.local");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  function as(
    principal: Principal,
    method: "get" | "post" | "delete",
    path: string,
  ) {
    const req = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? req
      : req.set("x-csrf-token", principal.csrfToken);
  }

  async function createEvent(): Promise<{ id: string }> {
    const response = await as(superAdmin, "post", "/api/v1/events").send({
      eventType: "CONCERT",
      name: "Files event",
    });
    expect(response.status).toBe(201);
    return body<{ id: string }>(response);
  }

  it("authorizes, verifies, attaches, grants private download, and detaches an event file", async () => {
    const event = await createEvent();
    const basePath = `/api/v1/events/${event.id}/files`;
    expect((await as(plainUser, "get", basePath)).status).toBe(403);

    const intentResponse = await as(
      superAdmin,
      "post",
      `${basePath}/upload-intents`,
    ).send({
      filename: "call-sheet.pdf",
      mediaType: "application/pdf",
      sizeBytes: 29,
    });
    expect(intentResponse.status).toBe(201);
    const intent = body<UploadIntentBody>(intentResponse);
    expect(intent).not.toHaveProperty("storageKey");
    expect(intent).not.toHaveProperty("bucket");
    const key = intent.upload.fields.key;
    if (!key) throw new Error("test upload grant omitted its object key");
    expect(key).toMatch(/^files\//);
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    expect(bytes.byteLength).toBe(29);
    storage.objects.set(key, {
      bytes,
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });

    const finalized = await as(
      superAdmin,
      "post",
      `${basePath}/${intent.id}/finalize`,
    );
    expect(finalized.status).toBe(200);
    expect(body<ManagedFileBody>(finalized)).toMatchObject({
      filename: "call-sheet.pdf",
      id: intent.id,
      mediaType: "application/pdf",
      sizeBytes: 29,
      state: "available",
    });

    const listed = await as(superAdmin, "get", basePath);
    expect(listed.status).toBe(200);
    expect(body<{ total: number }>(listed).total).toBe(1);

    const download = await as(
      superAdmin,
      "get",
      `${basePath}/${intent.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers["cache-control"]).toBe("private, no-store");
    expect(body<{ url: string }>(download).url).toContain(
      "https://storage.test/download/",
    );

    const removed = await as(superAdmin, "delete", `${basePath}/${intent.id}`);
    expect(removed.status).toBe(204);
    expect(
      (await as(superAdmin, "get", `${basePath}/${intent.id}/download`)).status,
    ).toBe(404);
    expect(
      (
        await as(superAdmin, "get", basePath).then((response) =>
          body<{ total: number }>(response),
        )
      ).total,
    ).toBe(0);
  });

  it("rejects unsafe uploads with a stable conflict code", async () => {
    const event = await createEvent();
    const basePath = `/api/v1/events/${event.id}/files`;
    const intentResponse = await as(
      superAdmin,
      "post",
      `${basePath}/upload-intents`,
    ).send({
      filename: "report.pdf",
      mediaType: "application/pdf",
      sizeBytes: 9,
    });
    const intent = body<UploadIntentBody>(intentResponse);
    const key = intent.upload.fields.key;
    if (!key) throw new Error("test upload grant omitted its object key");
    storage.objects.set(key, {
      bytes: Buffer.from("not a pdf"),
      mediaType: "application/pdf",
      sizeBytes: 9,
    });
    const finalized = await as(
      superAdmin,
      "post",
      `${basePath}/${intent.id}/finalize`,
    );
    expect(finalized.status).toBe(409);
    expect(body<ProblemBody>(finalized).code).toBe("FILE_VERIFICATION_FAILED");
  });
});
