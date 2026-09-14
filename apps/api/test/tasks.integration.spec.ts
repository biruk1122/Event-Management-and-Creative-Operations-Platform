import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  FILE_SCANNER,
  type FileScanner,
} from "../src/file-management/file-scanner.js";
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

class TaskFileStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  failDownloadGrant = false;

  createUploadGrant(input: {
    key: string;
    mediaType: string;
    sizeBytes: number;
  }) {
    return Promise.resolve({
      fields: { "Content-Type": input.mediaType, key: input.key },
      url: "https://storage.test/upload",
    });
  }

  readObject(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  createDownloadGrant() {
    if (this.failDownloadGrant) {
      return Promise.reject(new Error("simulated task download grant failure"));
    }
    return Promise.resolve({
      expiresAt: new Date("2030-01-01T00:05:00.000Z"),
      url: "https://storage.test/download",
    });
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

class CleanTaskFileScanner implements FileScanner {
  beforeNextResult: (() => Promise<void>) | undefined;

  async scan() {
    const beforeResult = this.beforeNextResult;
    this.beforeNextResult = undefined;
    await beforeResult?.();
    return Promise.resolve<"clean">("clean");
  }
}

interface Principal {
  id: string;
  cookies: string[];
  csrfToken: string;
}

interface TaskBody {
  id: string;
  departmentId: string | null;
  title: string;
  status: string;
  progress: number;
  assignees: Array<{ id: string }>;
}

function body<T>(response: request.Response): T {
  return response.body as T;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));
  const value = cookie?.slice(name.length + 1).split(";")[0];
  if (!value) throw new Error(`cookie ${name} not present`);
  return value;
}

describe("task assignment and collaboration API", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;
  let management: Principal;
  let departmentManager: Principal;
  let otherDepartmentManager: Principal;
  let member: Principal;
  let departmentId: string;
  let workspaceId: string;
  let scanner: CleanTaskFileScanner;
  let storage: TaskFileStorage;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "tasks-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "tasks-refresh-token-secret-at-least-32-characters";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    process.env.FILE_SCANNER_MODE = "test";

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: database.url },
        { schema: database.schema },
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
    storage = new TaskFileStorage();
    scanner = new CleanTaskFileScanner();
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

    const department = await prisma.department.create({
      data: { name: "Task Production" },
    });
    const otherDepartment = await prisma.department.create({
      data: { name: "Task Marketing" },
    });
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    departmentId = department.id;
    workspaceId = workspace.id;

    management = await createPrincipal(
      "management@tasks.test",
      "Management/Administrator",
    );
    departmentManager = await createPrincipal(
      "department-manager@tasks.test",
      "Department Manager",
      department.id,
    );
    otherDepartmentManager = await createPrincipal(
      "other-manager@tasks.test",
      "Department Manager",
      otherDepartment.id,
    );
    member = await createPrincipal(
      "member@tasks.test",
      "Team Member",
      department.id,
    );
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.drop();
  });

  async function createPrincipal(
    email: string,
    roleName: string,
    userDepartmentId?: string,
  ): Promise<Principal> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const user = await prisma.user.create({
      data: {
        email,
        ...(userDepartmentId ? { departmentId: userDepartmentId } : {}),
        credential: { create: { passwordHash: credentialHash } },
        roleAssignment: { create: { roleId: role.id } },
      },
    });
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    const cookies = setCookies(response);
    return {
      id: user.id,
      cookies,
      csrfToken: cookieValue(cookies, "csrf_token"),
    };
  }

  function as(
    principal: Principal,
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
  ) {
    const call = request(http)[method](path).set("Cookie", principal.cookies);
    return method === "get"
      ? call
      : call.set("x-csrf-token", principal.csrfToken);
  }

  it("rejects an ownerless task with a stable Problem Details code", async () => {
    const response = await as(management, "post", "/api/v1/tasks").send({
      title: "Ownerless",
    });
    expect(response.status).toBe(400);
    expect(body<{ code: string }>(response).code).toBe("TASK_OWNER_REQUIRED");
    expect(response.type).toBe("application/problem+json");
  });

  it("supports the assignment, collaboration, submission, and review workflow", async () => {
    const createdResponse = await as(management, "post", "/api/v1/tasks").send({
      title: "Confirm venue permits",
      description: "Coordinate final approval.",
      departmentId,
      workspaceId,
      priority: "URGENT",
      startAt: "2026-10-01T09:00:00.000Z",
      dueAt: "2026-10-02T09:00:00.000Z",
    });
    expect(createdResponse.status).toBe(201);
    const created = body<TaskBody>(createdResponse);
    expect(created).toMatchObject({
      departmentId,
      status: "TODO",
      progress: 0,
      assignees: [],
    });

    const assignmentPath = `/api/v1/tasks/${created.id}/assignees/${member.id}`;
    const [assignedResponse, retriedAssignmentResponse] = await Promise.all([
      as(departmentManager, "put", assignmentPath),
      as(departmentManager, "put", assignmentPath),
    ]);
    expect([assignedResponse.status, retriedAssignmentResponse.status]).toEqual(
      [200, 200],
    );
    expect(body<TaskBody>(retriedAssignmentResponse).assignees).toEqual([
      expect.objectContaining({ id: member.id }),
    ]);

    const memberList = await as(member, "get", "/api/v1/tasks?sort=DUE_AT");
    expect(memberList.status).toBe(200);
    expect(body<{ items: TaskBody[] }>(memberList).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const calendarWindow = await as(
      member,
      "get",
      "/api/v1/tasks?scheduledFrom=2026-10-01T12%3A00%3A00.000Z&scheduledTo=2026-10-01T18%3A00%3A00.000Z",
    );
    expect(calendarWindow.status).toBe(200);
    expect(body<{ items: TaskBody[] }>(calendarWindow).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const progress = await as(
      member,
      "patch",
      `/api/v1/tasks/${created.id}/progress`,
    ).send({ progress: 60 });
    expect(progress.status).toBe(200);
    expect(body<TaskBody>(progress).progress).toBe(60);

    const started = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/transition`,
    ).send({ status: "IN_PROGRESS" });
    expect(started.status).toBe(200);

    const submitted = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/submit`,
    );
    expect(submitted.status).toBe(200);
    expect(body<TaskBody>(submitted).status).toBe("UNDER_REVIEW");

    const comment = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/comments`,
    ).send({
      content: "Ready for review.",
      mentionedUserIds: [departmentManager.id],
    });
    expect(comment.status).toBe(201);
    expect(
      body<{ mentionedUsers: Array<{ id: string }> }>(comment).mentionedUsers,
    ).toEqual([expect.objectContaining({ id: departmentManager.id })]);

    const changes = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/reviews`,
    ).send({ outcome: "CHANGES_REQUESTED", note: "Add the permit number." });
    expect(changes.status).toBe(201);
    expect(body<TaskBody>(changes).status).toBe("IN_PROGRESS");

    await as(member, "post", `/api/v1/tasks/${created.id}/submit`).expect(200);
    const approved = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/reviews`,
    ).send({ outcome: "APPROVED" });
    expect(approved.status).toBe(201);
    expect(body<TaskBody>(approved).status).toBe("COMPLETED");

    const activity = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${created.id}/activity`,
    );
    expect(activity.status).toBe(200);
    expect(
      body<{ items: Array<{ type: string }> }>(activity).items.map(
        ({ type }) => type,
      ),
    ).toEqual(
      expect.arrayContaining([
        "CREATED",
        "ASSIGNEE_ADDED",
        "PROGRESS_UPDATED",
        "COMMENT_ADDED",
        "REVIEW_RECORDED",
      ]),
    );
    const taskAuditActions = (
      await prisma.auditRecord.findMany({
        where: { resourceId: created.id },
        select: { action: true, requestId: true },
      })
    ).map(({ action }) => action);
    expect(taskAuditActions).toEqual(
      expect.arrayContaining([
        "task.assignee_added",
        "task.submitted_for_review",
        "task.review.changes_requested",
        "task.review.approved",
      ]),
    );
    expect(
      await prisma.auditRecord.count({
        where: { action: "task.submitted_for_review", resourceId: created.id },
      }),
    ).toBe(2);
    expect(
      await prisma.auditRecord.count({
        where: { resourceId: created.id, requestId: null },
      }),
    ).toBe(0);

    const fileIntent = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/files/upload-intents`,
    ).send({
      filename: "permit.pdf",
      mediaType: "application/pdf",
      sizeBytes: 29,
    });
    expect(fileIntent.status).toBe(201);
    const intentBody = body<{
      id: string;
      upload: { fields: Record<string, string> };
    }>(fileIntent);
    const intentId = intentBody.id;
    const storageKey = intentBody.upload.fields.key;
    if (!storageKey) throw new Error("task upload intent omitted its key");
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    storage.objects.set(storageKey, {
      bytes,
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });
    const intent = await prisma.managedFile.findUniqueOrThrow({
      where: { id: intentId },
      select: { intentTaskId: true, intentWorkspaceId: true },
    });
    expect(intent).toEqual({
      intentTaskId: created.id,
      intentWorkspaceId: null,
    });

    const finalized = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/files/${intentId}/finalize`,
    );
    expect(finalized.status).toBe(200);
    expect(body<{ id: string; state: string }>(finalized)).toMatchObject({
      id: intentId,
      state: "available",
    });
    const taskFiles = await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/files`,
    );
    expect(taskFiles.status).toBe(200);
    expect(
      body<{ items: Array<{ id: string }>; total: number }>(taskFiles),
    ).toMatchObject({
      items: [expect.objectContaining({ id: intentId })],
      total: 1,
    });
    expect(
      await prisma.taskActivity.count({
        where: { taskId: created.id, type: "ATTACHMENT_ADDED" },
      }),
    ).toBe(1);

    const expiringIntentResponse = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/files/upload-intents`,
    ).send({
      filename: "expiring-permit.pdf",
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });
    expect(expiringIntentResponse.status).toBe(201);
    const expiringIntent = body<{
      id: string;
      upload: { fields: Record<string, string> };
    }>(expiringIntentResponse);
    const expiringStorageKey = expiringIntent.upload.fields.key;
    if (!expiringStorageKey)
      throw new Error("expiring task upload intent omitted its key");
    storage.objects.set(expiringStorageKey, {
      bytes,
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });
    scanner.beforeNextResult = async () => {
      await prisma.managedFile.update({
        where: { id: expiringIntent.id },
        data: { intentExpiresAt: new Date(Date.now() - 1) },
      });
    };
    const expiredDuringScan = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/files/${expiringIntent.id}/finalize`,
    );
    expect(expiredDuringScan.status).toBe(409);
    expect(body<{ code: string }>(expiredDuringScan).code).toBe(
      "FILE_INTENT_EXPIRED",
    );
    expect(
      await prisma.managedFile.findUniqueOrThrow({
        where: { id: expiringIntent.id },
        select: { state: true },
      }),
    ).toEqual({ state: "UNAVAILABLE" });

    const downloaded = await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/files/${intentId}/download`,
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");
    const downloadAudit = await prisma.auditRecord.findFirst({
      where: { action: "managed_file.downloaded", resourceId: intentId },
      select: { actorUserId: true, metadata: true, requestId: true },
    });
    expect(downloadAudit).toMatchObject({
      actorUserId: member.id,
      metadata: { parentId: created.id, parentType: "task" },
    });
    expect(typeof downloadAudit?.requestId).toBe("string");

    const missingFileId = randomUUID();
    await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/files/${missingFileId}/download`,
    ).expect(404);
    const deniedDownloadAudit = (await prisma.auditRecord.findFirst({
      where: {
        action: "managed_file.downloaded",
        outcome: "DENIED",
        resourceId: missingFileId,
      },
      select: { metadata: true },
    })) as unknown as { metadata: unknown } | null;
    expect(deniedDownloadAudit).toMatchObject({
      metadata: {
        errorCode: "FILE_NOT_FOUND",
        parentId: created.id,
        parentType: "task",
      },
    });

    storage.failDownloadGrant = true;
    await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/files/${intentId}/download`,
    ).expect(500);
    storage.failDownloadGrant = false;
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "managed_file.downloaded",
          outcome: "FAILED",
          resourceId: intentId,
        },
      }),
    ).toBe(1);

    await as(member, "post", `/api/v1/tasks/${created.id}/submit`).expect(409);
    const failedSubmissionAudit = (await prisma.auditRecord.findFirst({
      where: {
        action: "task.submitted_for_review",
        outcome: "FAILED",
        resourceId: created.id,
      },
      select: { metadata: true, workspaceContext: true },
    })) as unknown as {
      metadata: unknown;
      workspaceContext: string | null;
    } | null;
    expect(failedSubmissionAudit).toMatchObject({
      metadata: { errorCode: "TASK_INVALID_TRANSITION" },
      workspaceContext: workspaceId,
    });

    const hidden = await as(
      otherDepartmentManager,
      "get",
      `/api/v1/tasks/${created.id}`,
    );
    expect(hidden.status).toBe(403);
    expect(body<{ code: string }>(hidden).code).toBe("PERMISSION_DENIED");
    const authorizationAudit = (await prisma.auditRecord.findFirst({
      where: {
        action: "authorization.denied",
        actorUserId: otherDepartmentManager.id,
        outcome: "DENIED",
        resourceId: created.id,
      },
      select: { metadata: true, requestId: true, workspaceContext: true },
    })) as unknown as {
      metadata: unknown;
      requestId: string | null;
      workspaceContext: string | null;
    } | null;
    expect(authorizationAudit).toMatchObject({
      metadata: { errorCode: "PERMISSION_DENIED" },
      workspaceContext: workspaceId,
    });
    expect(typeof authorizationAudit?.requestId).toBe("string");
  });
});
