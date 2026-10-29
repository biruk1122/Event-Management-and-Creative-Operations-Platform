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
  progress: number | null;
  assignees: Array<{ id: string }>;
}

interface TaskChecklistItemBody {
  id: string;
  description: string;
  completed: boolean;
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
  let secondMember: Principal;
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
      data: { name: "Production" },
    });
    const otherDepartment = await prisma.department.create({
      data: { name: "Marketing" },
    });
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    departmentId = department.id;
    workspaceId = workspace.id;

    management = await createPrincipal("management@tasks.test", "Super Admin");
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
      "Department Member",
      department.id,
    );
    secondMember = await createPrincipal(
      "second-member@tasks.test",
      "Department Member",
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
      progress: null,
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

    // Progress is now checklist-derived: the Manager (task.update at
    // DEPARTMENT scope) authors two checkpoints - a plain assignee cannot
    // author items, only toggle them (asserted separately below) - then
    // the task starts untracked, and toggling each moves the percentage
    // 0 -> 50 -> 100 as the completed/total ratio changes.
    const firstItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/checklist-items`,
    ).send({ description: "Confirm venue permits" });
    expect(firstItem.status).toBe(201);
    const firstItemId = body<TaskChecklistItemBody>(firstItem).id;

    const secondItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/checklist-items`,
    ).send({ description: "Notify the venue contact" });
    expect(secondItem.status).toBe(201);
    const secondItemId = body<TaskChecklistItemBody>(secondItem).id;

    // Two checklist items exist but neither is complete yet: 0%, not
    // "not tracked" - that state is reserved for zero checklist items.
    const untouched = await as(member, "get", `/api/v1/tasks/${created.id}`);
    expect(body<TaskBody>(untouched).progress).toBe(0);

    const halfway = await as(
      member,
      "patch",
      `/api/v1/tasks/${created.id}/checklist-items/${firstItemId}/completion`,
    ).send({ completed: true });
    expect(halfway.status).toBe(200);
    expect(body<TaskBody>(halfway).progress).toBe(50);

    const progress = await as(
      member,
      "patch",
      `/api/v1/tasks/${created.id}/checklist-items/${secondItemId}/completion`,
    ).send({ completed: true });
    expect(progress.status).toBe(200);
    expect(body<TaskBody>(progress).progress).toBe(100);

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
        "CHECKLIST_ITEM_ADDED",
        "CHECKLIST_ITEM_COMPLETED",
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

  it("supports the Super Admin -> Department Manager self-report chain, and refuses the Manager's own self-review", async () => {
    const createdResponse = await as(management, "post", "/api/v1/tasks").send({
      title: "Quarterly marketing plan",
      departmentId,
      workspaceId,
    });
    expect(createdResponse.status).toBe(201);
    const created = body<TaskBody>(createdResponse);

    const assigned = await as(
      management,
      "put",
      `/api/v1/tasks/${created.id}/assignees/${departmentManager.id}`,
    );
    expect(assigned.status).toBe(200);

    // The assigned Department Manager - not an org-wide Super Admin grant -
    // reports back on their own task: checklist, transition, submit.
    const checklistItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/checklist-items`,
    ).send({ description: "Draft the quarterly plan" });
    expect(checklistItem.status).toBe(201);
    const checklistItemId = body<TaskChecklistItemBody>(checklistItem).id;

    const progress = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${created.id}/checklist-items/${checklistItemId}/completion`,
    ).send({ completed: true });
    expect(progress.status).toBe(200);
    expect(body<TaskBody>(progress).progress).toBe(100);

    await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/transition`,
    )
      .send({ status: "IN_PROGRESS" })
      .expect(200);

    const submitted = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/submit`,
    );
    expect(submitted.status).toBe(200);
    expect(body<TaskBody>(submitted).status).toBe("UNDER_REVIEW");

    // The Manager cannot approve their own submission, even though they
    // hold `task.review` for their own department - it must genuinely reach
    // Super Admin.
    const selfReview = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${created.id}/reviews`,
    ).send({ outcome: "APPROVED" });
    expect(selfReview.status).toBe(403);
    expect(body<{ code: string }>(selfReview).code).toBe("PERMISSION_DENIED");

    const approved = await as(
      management,
      "post",
      `/api/v1/tasks/${created.id}/reviews`,
    ).send({ outcome: "APPROVED" });
    expect(approved.status).toBe(201);
    expect(body<TaskBody>(approved).status).toBe("COMPLETED");
  });

  it("enforces validation, access, lifecycle, feed, and rollback boundaries", async () => {
    await request(http)
      .post("/api/v1/tasks")
      .send({ title: "Unauthenticated" })
      .expect(401);

    const reversedSchedule = await as(management, "post", "/api/v1/tasks").send(
      {
        title: "Reversed schedule",
        departmentId,
        startAt: "2026-11-02T09:00:00.000Z",
        dueAt: "2026-11-01T09:00:00.000Z",
      },
    );
    expect(reversedSchedule.status).toBe(400);
    expect(body<{ code: string }>(reversedSchedule).code).toBe(
      "TASK_SCHEDULE_INVALID",
    );

    const createdResponse = await as(management, "post", "/api/v1/tasks").send({
      title: "Boundary checks",
      departmentId,
      startAt: "2026-11-01T09:00:00.000Z",
      dueAt: "2026-11-02T09:00:00.000Z",
    });
    expect(createdResponse.status).toBe(201);
    const created = body<TaskBody>(createdResponse);

    const missingTask = await as(
      management,
      "get",
      `/api/v1/tasks/${randomUUID()}`,
    );
    expect(missingTask.status).toBe(404);
    expect(body<{ code: string }>(missingTask).code).toBe("TASK_NOT_FOUND");

    const missingAssignee = await as(
      departmentManager,
      "put",
      `/api/v1/tasks/${created.id}/assignees/${randomUUID()}`,
    );
    expect(missingAssignee.status).toBe(404);
    expect(body<{ code: string }>(missingAssignee).code).toBe(
      "TASK_USER_NOT_FOUND",
    );

    await as(
      departmentManager,
      "put",
      `/api/v1/tasks/${created.id}/assignees/${member.id}`,
    ).expect(200);
    const secondAssignment = await as(
      departmentManager,
      "put",
      `/api/v1/tasks/${created.id}/assignees/${secondMember.id}`,
    );
    expect(secondAssignment.status).toBe(200);
    expect(body<TaskBody>(secondAssignment).assignees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: member.id }),
        expect.objectContaining({ id: secondMember.id }),
      ]),
    );
    await as(secondMember, "get", `/api/v1/tasks/${created.id}`).expect(200);
    await as(member, "post", `/api/v1/tasks/${created.id}/comments`)
      .send({ content: "First update." })
      .expect(201);

    const invalidFeedPage = await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/comments?page=0`,
    );
    expect(invalidFeedPage.status).toBe(400);

    const comments = await as(
      member,
      "get",
      `/api/v1/tasks/${created.id}/comments?page=1&pageSize=1`,
    );
    expect(comments.status).toBe(200);
    expect(
      body<{ items: Array<{ content: string }>; total: number }>(comments),
    ).toMatchObject({
      items: [expect.objectContaining({ content: "First update." })],
      total: 1,
    });

    const invalidTransition = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/transition`,
    ).send({ status: "COMPLETED" });
    expect(invalidTransition.status).toBe(409);
    expect(body<{ code: string }>(invalidTransition).code).toBe(
      "TASK_INVALID_TRANSITION",
    );

    await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
      .send({ status: "IN_PROGRESS" })
      .expect(200);
    await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
      .send({ status: "BLOCKED" })
      .expect(200);
    await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
      .send({ status: "TODO" })
      .expect(200);
    await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
      .send({ status: "IN_PROGRESS" })
      .expect(200);
    await as(member, "post", `/api/v1/tasks/${created.id}/submit`).expect(200);
    const reviewRequired = await as(
      member,
      "post",
      `/api/v1/tasks/${created.id}/transition`,
    ).send({ status: "TODO" });
    expect(reviewRequired.status).toBe(409);
    expect(body<{ code: string }>(reviewRequired).code).toBe(
      "TASK_INVALID_TRANSITION",
    );
    await as(departmentManager, "post", `/api/v1/tasks/${created.id}/reviews`)
      .send({ outcome: "APPROVED" })
      .expect(201);
    await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
      .send({ status: "IN_PROGRESS" })
      .expect(409);

    await as(
      departmentManager,
      "delete",
      `/api/v1/tasks/${created.id}/assignees/${member.id}`,
    ).expect(200);
    const removedAgain = await as(
      departmentManager,
      "delete",
      `/api/v1/tasks/${created.id}/assignees/${member.id}`,
    );
    expect(removedAgain.status).toBe(409);
    expect(body<{ code: string }>(removedAgain).code).toBe(
      "TASK_ASSIGNEE_NOT_ASSIGNED",
    );
    await as(member, "get", `/api/v1/tasks/${created.id}`).expect(403);

    const attachmentTaskResponse = await as(
      management,
      "post",
      "/api/v1/tasks",
    ).send({
      title: "Attachment rollback",
      departmentId,
    });
    expect(attachmentTaskResponse.status).toBe(201);
    const attachmentTask = body<TaskBody>(attachmentTaskResponse);
    await as(
      departmentManager,
      "put",
      `/api/v1/tasks/${attachmentTask.id}/assignees/${member.id}`,
    ).expect(200);
    const intentResponse = await as(
      member,
      "post",
      `/api/v1/tasks/${attachmentTask.id}/files/upload-intents`,
    ).send({
      filename: "rollback.pdf",
      mediaType: "application/pdf",
      sizeBytes: 29,
    });
    expect(intentResponse.status).toBe(201);
    const intent = body<{
      id: string;
      upload: { fields: Record<string, string> };
    }>(intentResponse);
    const storageKey = intent.upload.fields.key;
    if (!storageKey) throw new Error("task upload intent omitted its key");
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    storage.objects.set(storageKey, {
      bytes,
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
    });

    await database.query(`
      CREATE FUNCTION force_task_attachment_failure() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced task attachment failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.query(`
      CREATE TRIGGER force_task_attachment_failure
      BEFORE INSERT ON task_attachments
      FOR EACH ROW EXECUTE FUNCTION force_task_attachment_failure();
    `);
    try {
      await as(
        member,
        "post",
        `/api/v1/tasks/${attachmentTask.id}/files/${intent.id}/finalize`,
      ).expect(500);
      expect(
        await prisma.managedFile.findUniqueOrThrow({
          where: { id: intent.id },
          select: { state: true },
        }),
      ).toEqual({ state: "PENDING" });
      expect(
        await prisma.taskAttachment.count({
          where: { managedFileId: intent.id },
        }),
      ).toBe(0);
      expect(
        await prisma.taskActivity.count({
          where: { taskId: attachmentTask.id, type: "ATTACHMENT_ADDED" },
        }),
      ).toBe(0);
    } finally {
      await database.query(
        "DROP TRIGGER force_task_attachment_failure ON task_attachments",
      );
      await database.query("DROP FUNCTION force_task_attachment_failure()");
    }
  });

  it("lets a Department Manager create and assign a task within their own department in one call", async () => {
    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Create-and-assign in one request",
      description: "New task creation flow.",
      type: "LOGISTICS",
      departmentId,
      assigneeId: member.id,
      dueAt: "2026-12-01T00:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);
    expect(task.departmentId).toBe(departmentId);
    expect(task.assignees.map((assignee) => assignee.id)).toEqual([member.id]);

    // The create-then-assign flow reuses `addAssignee`'s existing outbox
    // append, so `task.assigned` fires without any new notification code.
    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: { name: "task.assigned", resourceId: task.id },
    });
    expect(outboxEvent).not.toBeNull();
  });

  it("rejects a Department Manager creating a task outside their own department", async () => {
    const response = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Cross-department attempt",
      departmentId: (
        await prisma.department.findFirstOrThrow({
          where: { name: "Marketing" },
        })
      ).id,
    });
    expect(response.status).toBe(403);
    expect(body<{ code: string }>(response).code).toBe("PERMISSION_DENIED");
  });

  it("rejects assigning a task to a user outside the task's department, at creation and directly", async () => {
    const createdWithOutsideAssignee = await as(
      departmentManager,
      "post",
      "/api/v1/tasks",
    ).send({
      title: "Outside-department assignee at creation",
      departmentId,
      assigneeId: otherDepartmentManager.id,
    });
    expect(createdWithOutsideAssignee.status).toBe(400);
    expect(body<{ code: string }>(createdWithOutsideAssignee).code).toBe(
      "TASK_ASSIGNEE_OUTSIDE_DEPARTMENT",
    );

    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Needs an assignee later",
      departmentId,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    const directAssign = await as(
      departmentManager,
      "put",
      `/api/v1/tasks/${task.id}/assignees/${otherDepartmentManager.id}`,
    );
    expect(directAssign.status).toBe(400);
    expect(body<{ code: string }>(directAssign).code).toBe(
      "TASK_ASSIGNEE_OUTSIDE_DEPARTMENT",
    );
  });

  it("scopes the eligible-assignees picker to one department and keeps it out of reach for a plain member", async () => {
    const ownDepartment = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/eligible-assignees?departmentId=${departmentId}`,
    );
    expect(ownDepartment.status).toBe(200);
    const ids = body<{ items: Array<{ id: string }> }>(ownDepartment).items.map(
      (item) => item.id,
    );
    expect(ids).toEqual(expect.arrayContaining([member.id, secondMember.id]));
    expect(ids).not.toContain(otherDepartmentManager.id);

    const otherDepartmentId = (
      await prisma.department.findFirstOrThrow({
        where: { name: "Marketing" },
      })
    ).id;
    const crossDepartment = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/eligible-assignees?departmentId=${otherDepartmentId}`,
    );
    expect(crossDepartment.status).toBe(403);

    const asMember = await as(
      member,
      "get",
      `/api/v1/tasks/eligible-assignees?departmentId=${departmentId}`,
    );
    expect(asMember.status).toBe(403);
  });

  it("lets an assigned Department Member toggle checklist items but not author them", async () => {
    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Member checklist boundary",
      departmentId,
      assigneeId: member.id,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    const forbiddenAdd = await as(
      member,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Member-authored item" });
    expect(forbiddenAdd.status).toBe(403);
    expect(body<{ code: string }>(forbiddenAdd).code).toBe("PERMISSION_DENIED");

    const added = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Confirm venue permits" });
    expect(added.status).toBe(201);
    const itemId = body<TaskChecklistItemBody>(added).id;

    const toggled = await as(
      member,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${itemId}/completion`,
    ).send({ completed: true });
    expect(toggled.status).toBe(200);
    expect(body<TaskBody>(toggled).progress).toBe(100);
  });

  it("refuses a creator-only Department Manager the assignee-only self-report actions on a task assigned to someone else", async () => {
    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Assigner is not the assignee",
      departmentId,
      assigneeId: member.id,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    const addedItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Confirm venue permits" });
    expect(addedItem.status).toBe(201);
    const itemId = body<TaskChecklistItemBody>(addedItem).id;

    // The Manager created and assigned this task but is not its assignee -
    // SELF-scope visibility for these three actions now means "I am the
    // assignee," not "I am the assignee or the creator," so all three are
    // refused even though the Manager holds the underlying grant.
    const deniedToggle = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${itemId}/completion`,
    ).send({ completed: true });
    expect(deniedToggle.status).toBe(403);
    expect(body<{ code: string }>(deniedToggle).code).toBe("PERMISSION_DENIED");

    const deniedTransition = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/transition`,
    ).send({ status: "IN_PROGRESS" });
    expect(deniedTransition.status).toBe(403);
    expect(body<{ code: string }>(deniedTransition).code).toBe(
      "PERMISSION_DENIED",
    );

    // The assignee can start the task and toggle its checklist normally.
    await as(member, "post", `/api/v1/tasks/${task.id}/transition`)
      .send({ status: "IN_PROGRESS" })
      .expect(200);

    const deniedSubmit = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/submit`,
    );
    expect(deniedSubmit.status).toBe(403);
    expect(body<{ code: string }>(deniedSubmit).code).toBe("PERMISSION_DENIED");

    await as(member, "post", `/api/v1/tasks/${task.id}/submit`).expect(200);
  });

  it("enforces checklist item ownership: only the creator may edit or remove it", async () => {
    const created = await as(management, "post", "/api/v1/tasks").send({
      title: "Ownership boundary",
      departmentId,
      assigneeId: departmentManager.id,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    // Super Admin authors a checklist item - only Super Admin (its own
    // creator) may edit or remove it, even though the Department Manager
    // also holds `task.update` for this department's tasks.
    const superAdminItem = await as(
      management,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Confirm the venue contract" });
    expect(superAdminItem.status).toBe(201);
    const superAdminItemId = body<TaskChecklistItemBody>(superAdminItem).id;

    const managerEditDenied = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${superAdminItemId}`,
    ).send({ description: "Rewritten by the Manager" });
    expect(managerEditDenied.status).toBe(403);
    expect(body<{ code: string }>(managerEditDenied).code).toBe(
      "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
    );

    const managerDeleteDenied = await as(
      departmentManager,
      "delete",
      `/api/v1/tasks/${task.id}/checklist-items/${superAdminItemId}`,
    );
    expect(managerDeleteDenied.status).toBe(403);
    expect(body<{ code: string }>(managerDeleteDenied).code).toBe(
      "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
    );

    // The Manager (assignee here) can still complete/uncomplete the
    // Super Admin's item - toggling is never ownership-gated.
    const managerToggle = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${superAdminItemId}/completion`,
    ).send({ completed: true });
    expect(managerToggle.status).toBe(200);
    const uncompleted = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${superAdminItemId}/completion`,
    ).send({ completed: false });
    expect(uncompleted.status).toBe(200);

    // Super Admin, as the item's own creator, can edit and remove it.
    const superAdminEdit = await as(
      management,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${superAdminItemId}`,
    ).send({ description: "Confirm the signed venue contract" });
    expect(superAdminEdit.status).toBe(200);

    // The Manager authors their own item on the same task - they own it,
    // so they may edit and remove that one freely.
    const managerItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Draft the run sheet" });
    expect(managerItem.status).toBe(201);
    const managerItemId = body<TaskChecklistItemBody>(managerItem).id;

    const managerEditsOwn = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${task.id}/checklist-items/${managerItemId}`,
    ).send({ description: "Draft the final run sheet" });
    expect(managerEditsOwn.status).toBe(200);

    // Super Admin cannot delete the Manager's own item either - ownership
    // is symmetric, not an admin override.
    const superAdminDeleteOfManagerItemDenied = await as(
      management,
      "delete",
      `/api/v1/tasks/${task.id}/checklist-items/${managerItemId}`,
    );
    expect(superAdminDeleteOfManagerItemDenied.status).toBe(403);
    expect(
      body<{ code: string }>(superAdminDeleteOfManagerItemDenied).code,
    ).toBe("TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED");

    const managerDeletesOwn = await as(
      departmentManager,
      "delete",
      `/api/v1/tasks/${task.id}/checklist-items/${managerItemId}`,
    );
    expect(managerDeletesOwn.status).toBe(204);

    // A client cannot smuggle a creator/owner id through the request body
    // - the global ValidationPipe rejects any unknown property outright.
    const injectedOwner = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({
      description: "Trying to spoof ownership",
      createdById: management.id,
    });
    expect(injectedOwner.status).toBe(400);

    // Legacy data with no recorded creator (pre-dates ownership tracking,
    // or its creator's account was deleted) falls back to organization
    // scope only - never automatically opened up to the Manager.
    const legacyItem = await prisma.taskChecklistItem.create({
      data: { taskId: task.id, description: "Legacy checkpoint", position: 1 },
      select: { id: true },
    });
    const managerDeniedOnLegacy = await as(
      departmentManager,
      "delete",
      `/api/v1/tasks/${task.id}/checklist-items/${legacyItem.id}`,
    );
    expect(managerDeniedOnLegacy.status).toBe(403);
    expect(body<{ code: string }>(managerDeniedOnLegacy).code).toBe(
      "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
    );
    const superAdminAllowedOnLegacy = await as(
      management,
      "delete",
      `/api/v1/tasks/${task.id}/checklist-items/${legacyItem.id}`,
    );
    expect(superAdminAllowedOnLegacy.status).toBe(204);
  });

  it("lets the assigner (task creator) upload a file and both the assigner and the assignee see and download it", async () => {
    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Assigner-uploaded attachment",
      departmentId,
      assigneeId: member.id,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    // The assigner (creator), not the assignee, uploads the file.
    const fileIntent = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/files/upload-intents`,
    ).send({
      filename: "brief.pdf",
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

    const finalized = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/files/${intentId}/finalize`,
    );
    expect(finalized.status).toBe(200);
    expect(body<{ id: string; state: string }>(finalized)).toMatchObject({
      id: intentId,
      state: "available",
    });

    // The assigner can see and download their own upload.
    const assignerList = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${task.id}/files`,
    );
    expect(assignerList.status).toBe(200);
    expect(
      body<{ items: Array<{ id: string }>; total: number }>(assignerList),
    ).toMatchObject({ items: [expect.objectContaining({ id: intentId })], total: 1 });
    const assignerDownload = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${task.id}/files/${intentId}/download`,
    );
    expect(assignerDownload.status).toBe(200);
    expect(body<{ url: string }>(assignerDownload).url).toBeTruthy();

    // The assignee can also see and download what the assigner uploaded.
    const assigneeList = await as(
      member,
      "get",
      `/api/v1/tasks/${task.id}/files`,
    );
    expect(assigneeList.status).toBe(200);
    expect(
      body<{ items: Array<{ id: string }>; total: number }>(assigneeList),
    ).toMatchObject({ items: [expect.objectContaining({ id: intentId })], total: 1 });
    const assigneeDownload = await as(
      member,
      "get",
      `/api/v1/tasks/${task.id}/files/${intentId}/download`,
    );
    expect(assigneeDownload.status).toBe(200);
    expect(body<{ url: string }>(assigneeDownload).url).toBeTruthy();
  });

  it("rejects a checklist reorder whose id list does not match the task's current items", async () => {
    const created = await as(departmentManager, "post", "/api/v1/tasks").send({
      title: "Reorder mismatch",
      departmentId,
    });
    expect(created.status).toBe(201);
    const task = body<TaskBody>(created);

    const added = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items`,
    ).send({ description: "Confirm venue permits" });
    expect(added.status).toBe(201);

    const mismatch = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${task.id}/checklist-items/reorder`,
    ).send({ orderedItemIds: [randomUUID()] });
    expect(mismatch.status).toBe(400);
    expect(body<{ code: string }>(mismatch).code).toBe(
      "TASK_CHECKLIST_REORDER_MISMATCH",
    );
  });

  it("aggregates a parent's progress from its subtasks rather than its own checklist", async () => {
    const parentResponse = await as(
      departmentManager,
      "post",
      "/api/v1/tasks",
    ).send({
      title: "Campaign rollout",
      departmentId,
      assigneeId: departmentManager.id,
    });
    expect(parentResponse.status).toBe(201);
    const parent = body<TaskBody>(parentResponse);

    // The parent's own checklist is fully complete, but once it has
    // subtasks the aggregation rule must prefer their progress instead.
    const ownItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${parent.id}/checklist-items`,
    ).send({ description: "Kick off planning" });
    expect(ownItem.status).toBe(201);
    const ownItemId = body<TaskChecklistItemBody>(ownItem).id;
    await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${parent.id}/checklist-items/${ownItemId}/completion`,
    ).send({ completed: true });

    const fullyChecked = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${parent.id}`,
    );
    expect(body<TaskBody>(fullyChecked).progress).toBe(100);

    const subtaskResponse = await as(
      departmentManager,
      "post",
      "/api/v1/tasks",
    ).send({
      title: "Draft the social copy",
      parentTaskId: parent.id,
      // The subtask's own checklist toggle below needs an actual assignee
      // now that SELF-scope for task.update_progress means "I am the
      // assignee," not "I created this" - the Manager both created and
      // is assigned here, matching the real self-report workflow.
      assigneeId: departmentManager.id,
    });
    expect(subtaskResponse.status).toBe(201);
    const subtask = body<TaskBody>(subtaskResponse);

    // A brand-new subtask with no checklist of its own is untracked, which
    // now overrides the parent's own (otherwise 100%) checklist.
    const afterSubtask = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${parent.id}`,
    );
    expect(body<TaskBody>(afterSubtask).progress).toBeNull();

    const subtaskItem = await as(
      departmentManager,
      "post",
      `/api/v1/tasks/${subtask.id}/checklist-items`,
    ).send({ description: "Write the copy" });
    expect(subtaskItem.status).toBe(201);
    const subtaskItemId = body<TaskChecklistItemBody>(subtaskItem).id;

    const subtaskToggled = await as(
      departmentManager,
      "patch",
      `/api/v1/tasks/${subtask.id}/checklist-items/${subtaskItemId}/completion`,
    ).send({ completed: true });
    expect(subtaskToggled.status).toBe(200);
    expect(body<TaskBody>(subtaskToggled).progress).toBe(100);

    const parentAfterSubtaskComplete = await as(
      departmentManager,
      "get",
      `/api/v1/tasks/${parent.id}`,
    );
    expect(body<TaskBody>(parentAfterSubtaskComplete).progress).toBe(100);
  });
});
