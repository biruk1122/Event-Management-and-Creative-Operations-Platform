import { PrismaPg } from "@prisma/adapter-pg";
/* eslint-disable @typescript-eslint/require-await */
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  FILE_OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from "../src/file-management/storage/object-storage.js";
import {
  FILE_SCANNER,
  type FileScanner,
  type ScanResult,
} from "../src/file-management/file-scanner.js";
import type { FileManagementService } from "../src/file-management/file-management.service.js";
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

const UPLOAD_INTENT_RESPONSE_KEYS = [
  "createdAt",
  "filename",
  "id",
  "intentExpiresAt",
  "mediaType",
  "sizeBytes",
  "state",
  "upload",
].sort();

const DOWNLOAD_GRANT_RESPONSE_KEYS = [
  "expiresAt",
  "filename",
  "mediaType",
  "url",
].sort();

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

class ControlledFileScanner implements FileScanner {
  result: ScanResult = "clean";

  scan(): Promise<ScanResult> {
    return Promise.resolve(this.result);
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
  let scanner: ControlledFileScanner;
  let files: FileManagementService;
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

    const [{ Test }, appModule, appSetup, hasherModule, fileManagementModule] =
      await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module.js"),
        import("../src/app.setup.js"),
        import("../src/auth/domain/password-hasher.js"),
        import("../src/file-management/file-management.service.js"),
      ]);
    const credentialHash = await new hasherModule.PasswordHasher().hash(
      PASSWORD,
    );
    storage = new InMemoryObjectStorage();
    scanner = new ControlledFileScanner();
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(storage)
      .overrideProvider(FILE_SCANNER)
      .useValue(scanner)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();
    files = app.get(fileManagementModule.FileManagementService);

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

  beforeEach(() => {
    scanner.result = "clean";
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

  async function createUploadIntent(
    eventId: string,
    payload: Record<string, unknown> = {},
  ): Promise<UploadIntentBody> {
    const response = await as(
      superAdmin,
      "post",
      `/api/v1/events/${eventId}/files/upload-intents`,
    ).send({
      filename: "call-sheet.pdf",
      mediaType: "application/pdf",
      sizeBytes: 29,
      ...payload,
    });
    expect(response.status).toBe(201);
    return body<UploadIntentBody>(response);
  }

  function storePdf(intent: UploadIntentBody): string {
    const key = intent.upload.fields.key;
    if (!key) throw new Error("test upload grant omitted its object key");
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    expect(bytes.byteLength).toBe(29);
    storage.objects.set(key, {
      bytes,
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });
    return key;
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
    expect(Object.keys(intent).sort()).toEqual(UPLOAD_INTENT_RESPONSE_KEYS);
    expect(intent).not.toHaveProperty("storageKey");
    expect(intent).not.toHaveProperty("bucket");
    const key = storePdf(intent);
    expect(key).toMatch(/^files\//);

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
    expect(Object.keys(body(download)).sort()).toEqual(
      DOWNLOAD_GRANT_RESPONSE_KEYS,
    );
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

  describe("authorization and request validation", () => {
    it("requires authentication, CSRF, and event permissions without persisting denied uploads", async () => {
      const event = await createEvent();
      const path = `/api/v1/events/${event.id}/files/upload-intents`;
      const before = await prisma.managedFile.count();

      expect((await request(http).post(path).send({})).status).toBe(401);
      expect(
        (
          await request(http)
            .post(path)
            .set("Cookie", superAdmin.cookies)
            .send({
              filename: "call-sheet.pdf",
              mediaType: "application/pdf",
              sizeBytes: 29,
            })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(plainUser, "post", path).send({
            filename: "call-sheet.pdf",
            mediaType: "application/pdf",
            sizeBytes: 29,
          })
        ).status,
      ).toBe(403);
      expect(await prisma.managedFile.count()).toBe(before);
    });

    it("rejects invalid declarations and list pagination with stable validation errors", async () => {
      const event = await createEvent();
      const basePath = `/api/v1/events/${event.id}/files`;
      const before = await prisma.managedFile.count();
      const invalidDeclaration = await as(
        superAdmin,
        "post",
        `${basePath}/upload-intents`,
      ).send({
        filename: "../unsafe.pdf",
        mediaType: "application/octet-stream",
        sizeBytes: 0,
      });
      expect(invalidDeclaration.status).toBe(400);
      expect(body<ProblemBody>(invalidDeclaration).code).toBe(
        "VALIDATION_ERROR",
      );
      expect(await prisma.managedFile.count()).toBe(before);

      const invalidPage = await as(
        superAdmin,
        "get",
        `${basePath}?page=0&pageSize=101`,
      );
      expect(invalidPage.status).toBe(400);
      expect(body<ProblemBody>(invalidPage).code).toBe("VALIDATION_ERROR");
    });
  });

  describe("failure states and explicit attachment boundaries", () => {
    it("uses non-enumerating not-found responses for unknown, cross-event, and finalized files", async () => {
      const event = await createEvent();
      const otherEvent = await createEvent();
      const intent = await createUploadIntent(event.id);
      storePdf(intent);
      expect(
        (
          await as(
            superAdmin,
            "post",
            `/api/v1/events/${event.id}/files/${intent.id}/finalize`,
          )
        ).status,
      ).toBe(200);

      for (const path of [
        `/api/v1/events/${event.id}/files/00000000-0000-0000-0000-000000000000/download`,
        `/api/v1/events/${otherEvent.id}/files/${intent.id}/download`,
        `/api/v1/events/${event.id}/files/${intent.id}/finalize`,
      ]) {
        const response = await as(
          superAdmin,
          path.endsWith("/finalize") ? "post" : "get",
          path,
        );
        expect(response.status).toBe(404);
        expect(body<ProblemBody>(response).code).toBe("FILE_NOT_FOUND");
      }
    });

    it("records expired, unsafe, infected, and scanner-unavailable intents as unavailable with stable errors", async () => {
      const event = await createEvent();
      const basePath = `/api/v1/events/${event.id}/files`;

      const expiredIntent = await createUploadIntent(event.id);
      const expiredAt = new Date(Date.now() - 1_000);
      await prisma.managedFile.update({
        where: { id: expiredIntent.id },
        data: {
          createdAt: new Date(expiredAt.getTime() - 1_000),
          intentExpiresAt: expiredAt,
        },
      });
      const expired = await as(
        superAdmin,
        "post",
        `${basePath}/${expiredIntent.id}/finalize`,
      );
      expect(expired.status).toBe(409);
      expect(body<ProblemBody>(expired).code).toBe("FILE_INTENT_EXPIRED");

      const unsafeIntent = await createUploadIntent(event.id, {
        filename: "unsafe.pdf",
        sizeBytes: 9,
      });
      const unsafeKey = unsafeIntent.upload.fields.key;
      if (!unsafeKey)
        throw new Error("test upload grant omitted its object key");
      storage.objects.set(unsafeKey, {
        bytes: Buffer.from("not a pdf"),
        mediaType: "application/pdf",
        sizeBytes: 9,
      });
      const unsafe = await as(
        superAdmin,
        "post",
        `${basePath}/${unsafeIntent.id}/finalize`,
      );
      expect(unsafe.status).toBe(409);
      expect(body<ProblemBody>(unsafe).code).toBe("FILE_VERIFICATION_FAILED");

      const scannerIntent = await createUploadIntent(event.id, {
        filename: "scanner.pdf",
      });
      storePdf(scannerIntent);
      scanner.result = "unavailable";
      const scannerUnavailable = await as(
        superAdmin,
        "post",
        `${basePath}/${scannerIntent.id}/finalize`,
      );
      expect(scannerUnavailable.status).toBe(503);
      expect(body<ProblemBody>(scannerUnavailable).code).toBe(
        "FILE_SCANNER_UNAVAILABLE",
      );

      const infectedIntent = await createUploadIntent(event.id, {
        filename: "infected.pdf",
      });
      storePdf(infectedIntent);
      scanner.result = "infected";
      const infected = await as(
        superAdmin,
        "post",
        `${basePath}/${infectedIntent.id}/finalize`,
      );
      expect(infected.status).toBe(409);
      expect(body<ProblemBody>(infected).code).toBe("FILE_VERIFICATION_FAILED");

      for (const id of [
        expiredIntent.id,
        unsafeIntent.id,
        scannerIntent.id,
        infectedIntent.id,
      ]) {
        const record = await prisma.managedFile.findUniqueOrThrow({
          where: { id },
        });
        expect(record.state).toBe("UNAVAILABLE");
        expect(record.unavailableAt).not.toBeNull();
        expect(record.cleanupAfter).not.toBeNull();
        expect(
          await prisma.workspaceFileAttachment.count({
            where: { managedFileId: id },
          }),
        ).toBe(0);
      }
    });
  });

  it("rolls back finalization when its explicit attachment transaction cannot commit", async () => {
    const event = await createEvent();
    const intent = await createUploadIntent(event.id);
    storePdf(intent);

    await db.query(`
      CREATE FUNCTION force_file_attachment_failure() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced attachment failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.query(`
      CREATE TRIGGER force_file_attachment_failure
      BEFORE INSERT ON workspace_file_attachments
      FOR EACH ROW EXECUTE FUNCTION force_file_attachment_failure();
    `);
    try {
      const response = await as(
        superAdmin,
        "post",
        `/api/v1/events/${event.id}/files/${intent.id}/finalize`,
      );
      expect(response.status).toBe(500);
      expect(body<ProblemBody>(response).code).toBe("INTERNAL_SERVER_ERROR");
      expect(
        (
          await prisma.managedFile.findUniqueOrThrow({
            where: { id: intent.id },
          })
        ).state,
      ).toBe("PENDING");
      expect(
        await prisma.workspaceFileAttachment.count({
          where: { managedFileId: intent.id },
        }),
      ).toBe(0);
    } finally {
      await db.query(
        "DROP TRIGGER force_file_attachment_failure ON workspace_file_attachments",
      );
      await db.query("DROP FUNCTION force_file_attachment_failure()");
    }
  });

  it("cleans up expired intents, seven-day orphan candidates, and 30-day detached files deterministically", async () => {
    await db.reset();
    storage.objects.clear();
    const now = new Date("2030-01-03T00:00:00.000Z");
    const keys = [
      "files/expired-intent",
      "files/orphan-candidate",
      "files/detached-file",
    ];
    for (const key of keys) {
      storage.objects.set(key, {
        bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"),
        mediaType: "application/pdf",
        sizeBytes: 29,
      });
    }
    const expiredIntent = await prisma.managedFile.create({
      data: {
        declaredMediaType: "application/pdf",
        declaredSizeBytes: 29,
        createdAt: new Date("2030-01-01T00:00:00.000Z"),
        intentExpiresAt: new Date("2030-01-02T00:00:00.000Z"),
        originalFilename: "expired.pdf",
        storageKey: keys[0]!,
      },
    });
    const orphanCandidate = await prisma.managedFile.create({
      data: {
        cleanupAfter: new Date("2030-01-01T00:00:00.000Z"),
        createdAt: new Date("2029-12-20T00:00:00.000Z"),
        declaredMediaType: "application/pdf",
        declaredSizeBytes: 29,
        intentExpiresAt: new Date("2030-01-04T00:00:00.000Z"),
        originalFilename: "orphan.pdf",
        state: "UNAVAILABLE",
        storageKey: keys[1]!,
        unavailableAt: new Date("2029-12-25T00:00:00.000Z"),
      },
    });
    const detachedFile = await prisma.managedFile.create({
      data: {
        availableAt: new Date("2029-11-30T00:00:00.000Z"),
        cleanupAfter: new Date("2029-12-31T00:00:00.000Z"),
        createdAt: new Date("2029-11-20T00:00:00.000Z"),
        declaredMediaType: "application/pdf",
        declaredSizeBytes: 29,
        intentExpiresAt: new Date("2029-12-02T00:00:00.000Z"),
        originalFilename: "detached.pdf",
        state: "UNAVAILABLE",
        storageKey: keys[2]!,
        unavailableAt: new Date("2029-12-01T00:00:00.000Z"),
        uploadedAt: new Date("2029-11-30T00:00:00.000Z"),
        verifiedMediaType: "application/pdf",
        verifiedSizeBytes: 29,
      },
    });

    await expect(files.cleanup(now)).resolves.toBe(3);
    for (const id of [expiredIntent.id, orphanCandidate.id, detachedFile.id]) {
      await expect(
        prisma.managedFile.findUnique({ where: { id } }),
      ).resolves.toBeNull();
    }
    for (const key of keys) expect(storage.objects.has(key)).toBe(false);
  });
});
