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
/** ADR 0004 §6's fixed 2s poll interval; the relay is a real running provider in this app instance. */
const RELAY_POLL_INTERVAL_MS = 2000;

class NoopFileStorage implements ObjectStorage {
  createUploadGrant() {
    return Promise.resolve({ fields: {}, url: "https://storage.test/upload" });
  }
  readObject(): Promise<StoredObject | null> {
    return Promise.resolve(null);
  }
  createDownloadGrant() {
    return Promise.resolve({
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      url: "https://storage.test/download",
    });
  }
  deleteObject(): Promise<void> {
    return Promise.resolve();
  }
}

class CleanFileScanner implements FileScanner {
  scan() {
    return Promise.resolve<"clean">("clean");
  }
}

interface Principal {
  id: string;
  cookies: string[];
  csrfToken: string;
}

interface NotificationBody {
  id: string;
  type: string;
  title: string;
  senderName: string | null;
  body: string;
  taskId: string | null;
  messageId: string | null;
  readAt: string | null;
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

async function waitFor<T>(
  check: () => Promise<T | undefined>,
  timeoutMs = 4 * RELAY_POLL_INTERVAL_MS,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() > deadline) {
      throw new Error("waitFor timed out waiting for the outbox relay");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("notifications API and delivery pipeline", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;
  let management: Principal;
  let departmentManager: Principal;
  let member: Principal;
  let secondMember: Principal;
  let departmentId: string;
  let workspaceId: string;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "notifications-access-token-secret-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "notifications-refresh-token-secret-32-characters";
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
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(FILE_OBJECT_STORAGE)
      .useValue(new NoopFileStorage())
      .overrideProvider(FILE_SCANNER)
      .useValue(new CleanFileScanner())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();

    const department = await prisma.department.create({
      data: { name: "Production" },
    });
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    departmentId = department.id;
    workspaceId = workspace.id;

    management = await createPrincipal(
      "management@notifications.test",
      "Super Admin",
    );
    departmentManager = await createPrincipal(
      "department-manager@notifications.test",
      "Department Manager",
      department.id,
    );
    member = await createPrincipal(
      "member@notifications.test",
      "Department Member",
      department.id,
    );
    secondMember = await createPrincipal(
      "second-member@notifications.test",
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

  async function feedFor(principal: Principal): Promise<NotificationBody[]> {
    const response = await as(principal, "get", "/api/v1/notifications");
    expect(response.status).toBe(200);
    return body<{ items: NotificationBody[] }>(response).items;
  }

  it("removes notifications persistently, preserves deduplication, and enforces ownership and CSRF", async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        name: "task.assigned",
        version: 1,
        occurredAt: new Date(),
        actorKind: "SYSTEM",
        resourceType: "task",
      },
    });
    const notification = await prisma.notification.create({
      data: {
        recipientUserId: member.id,
        type: "TASK_ASSIGNED",
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: "Remove me",
        body: "An owned notification",
      },
    });
    const path = `/api/v1/notifications/${notification.id}`;
    const before = body<{ unreadCount: number }>(
      await as(member, "get", "/api/v1/notifications/unread-count"),
    ).unreadCount;
    await request(http).delete(path).expect(401);
    await request(http).delete(path).set("Cookie", member.cookies).expect(403);
    await as(secondMember, "delete", path).expect(404);
    expect(
      (await feedFor(member)).some((item) => item.id === notification.id),
    ).toBe(true);
    await as(member, "delete", path).expect(204);
    await as(member, "delete", path).expect(204);
    expect(
      (await feedFor(member)).some((item) => item.id === notification.id),
    ).toBe(false);
    expect(
      body<{ unreadCount: number }>(
        await as(member, "get", "/api/v1/notifications/unread-count"),
      ).unreadCount,
    ).toBe(before - 1);
    const removed = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(removed.dismissedAt).not.toBeNull();
    await as(member, "put", `${path}/read`).expect(404);
    // The unique occurrence is retained, preventing replay from recreating it.
    await expect(
      prisma.notification.create({
        data: {
          recipientUserId: member.id,
          type: "TASK_ASSIGNED",
          sourceEventId: event.id,
          occurrenceKey: event.id,
          title: "Replay",
          body: "Replay",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    const read = await prisma.notification.create({
      data: {
        recipientUserId: member.id,
        type: "TASK_ASSIGNED",
        sourceEventId: event.id,
        occurrenceKey: randomUUID(),
        title: "Already read",
        body: "History",
        createdAt: new Date(Date.now() - 1000),
        readAt: new Date(),
      },
    });
    await as(member, "delete", `/api/v1/notifications/${read.id}`).expect(204);
    expect(
      body<{ unreadCount: number }>(
        await as(member, "get", "/api/v1/notifications/unread-count"),
      ).unreadCount,
    ).toBe(before - 1);
  });

  it("marks only the caller's unread notifications read, keeps history, and reports sender names", async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        name: "task.assigned",
        version: 1,
        occurredAt: new Date(),
        actorKind: "USER",
        actorUserId: secondMember.id,
        resourceType: "task",
      },
    });
    const create = (recipientUserId: string, readAt: Date | null) =>
      prisma.notification.create({
        data: {
          recipientUserId,
          type: "TASK_ASSIGNED",
          sourceEventId: event.id,
          occurrenceKey: randomUUID(),
          title: "Read-all check",
          body: "Part of a bulk read",
          createdAt: new Date(Date.now() - 1000),
          readAt,
        },
      });
    const unread = await create(member.id, null);
    const alreadyRead = await create(member.id, new Date());
    const other = await create(secondMember.id, null);

    await request(http).put("/api/v1/notifications/read-all").expect(401);
    await request(http)
      .put("/api/v1/notifications/read-all")
      .set("Cookie", member.cookies)
      .expect(403);

    const marked = await as(
      member,
      "put",
      "/api/v1/notifications/read-all",
    ).expect(200);
    expect(
      body<{ markedCount: number }>(marked).markedCount,
    ).toBeGreaterThanOrEqual(1);
    expect(
      body<{ unreadCount: number }>(
        await as(member, "get", "/api/v1/notifications/unread-count"),
      ).unreadCount,
    ).toBe(0);

    const memberFeed = await feedFor(member);
    const readItem = memberFeed.find((item) => item.id === unread.id);
    expect(readItem?.readAt).not.toBeNull();
    const sender = await prisma.user.findUniqueOrThrow({
      where: { id: secondMember.id },
    });
    expect(readItem?.senderName).toBe(
      [sender.firstName, sender.lastName].filter(Boolean).join(" ") || null,
    );
    expect(memberFeed.some((item) => item.id === alreadyRead.id)).toBe(true);

    const otherFeed = await feedFor(secondMember);
    expect(otherFeed.find((item) => item.id === other.id)?.readAt).toBeNull();

    const again = await as(
      member,
      "put",
      "/api/v1/notifications/read-all",
    ).expect(200);
    expect(body<{ markedCount: number }>(again).markedCount).toBe(0);
  });

  it(
    "delivers TASK_ASSIGNED and TASK_APPROVED/TASK_REJECTED through the outbox relay, and supports read state",
    { timeout: 60_000 },
    async () => {
      const created = body<{ id: string }>(
        await as(management, "post", "/api/v1/tasks").send({
          title: "Confirm venue permits",
          departmentId,
          workspaceId,
        }),
      );

      await as(
        departmentManager,
        "put",
        `/api/v1/tasks/${created.id}/assignees/${member.id}`,
      ).expect(200);

      const assigned = await waitFor(async () => {
        const items = await feedFor(member);
        return items.find(
          (item) => item.type === "TASK_ASSIGNED" && item.taskId === created.id,
        );
      });
      expect(assigned.title).toBeTruthy();
      expect(assigned.readAt).toBeNull();

      const unreadBefore = body<{ unreadCount: number }>(
        await as(member, "get", "/api/v1/notifications/unread-count"),
      );
      expect(unreadBefore.unreadCount).toBeGreaterThanOrEqual(1);

      const markedRead = await as(
        member,
        "put",
        `/api/v1/notifications/${assigned.id}/read`,
      );
      expect(markedRead.status).toBe(200);
      expect(body<NotificationBody>(markedRead).readAt).not.toBeNull();

      // Marking the same notification read again is a stable no-op.
      await as(
        member,
        "put",
        `/api/v1/notifications/${assigned.id}/read`,
      ).expect(200);

      const unknownId = await as(
        member,
        "put",
        `/api/v1/notifications/${randomUUID()}/read`,
      );
      expect(unknownId.status).toBe(404);
      expect(body<{ code: string }>(unknownId).code).toBe(
        "NOTIFICATION_NOT_FOUND",
      );

      // Someone else's notification id is also not_found, not forbidden -
      // existence is never revealed to a non-recipient.
      const someoneElses = await as(
        secondMember,
        "put",
        `/api/v1/notifications/${assigned.id}/read`,
      );
      expect(someoneElses.status).toBe(404);

      await as(member, "post", `/api/v1/tasks/${created.id}/transition`)
        .send({ status: "IN_PROGRESS" })
        .expect(200);
      await as(member, "post", `/api/v1/tasks/${created.id}/submit`).expect(
        200,
      );
      await as(management, "post", `/api/v1/tasks/${created.id}/reviews`)
        .send({
          outcome: "CHANGES_REQUESTED",
          note: "Add the venue details",
        })
        .expect(201);

      const rejected = await waitFor(async () => {
        const items = await feedFor(member);
        return items.find(
          (item) => item.type === "TASK_REJECTED" && item.taskId === created.id,
        );
      });
      expect(rejected.title).toBeTruthy();

      await as(member, "post", `/api/v1/tasks/${created.id}/submit`).expect(
        200,
      );
      await as(management, "post", `/api/v1/tasks/${created.id}/reviews`)
        .send({ outcome: "APPROVED" })
        .expect(201);

      const approved = await waitFor(async () => {
        const items = await feedFor(member);
        return items.find(
          (item) => item.type === "TASK_APPROVED" && item.taskId === created.id,
        );
      });
      expect(approved.title).toBeTruthy();

      // The reviewer never gets a notification for their own review decision.
      const reviewerFeed = await feedFor(departmentManager);
      expect(
        reviewerFeed.some(
          (item) =>
            item.taskId === created.id &&
            (item.type === "TASK_APPROVED" || item.type === "TASK_REJECTED"),
        ),
      ).toBe(false);
    },
  );

  it(
    "delivers NEW_MESSAGE to other members and MESSAGE_MENTION to a mentioned member, never to the author or a non-member mention",
    { timeout: 45_000 },
    async () => {
      const conversation = body<{ id: string }>(
        await as(member, "post", "/api/v1/conversations").send({
          type: "GROUP",
          memberIds: [secondMember.id, departmentManager.id],
        }),
      );
      // `management` is deliberately not a member of this conversation, so
      // mentioning them exercises the non-member-mention exclusion below.
      const posted = body<{ id: string }>(
        await as(
          member,
          "post",
          `/api/v1/conversations/${conversation.id}/messages`,
        ).send({
          content: "Standup notes",
          mentionedUserIds: [secondMember.id, management.id],
        }),
      );

      const newMessage = await waitFor(async () => {
        const items = await feedFor(departmentManager);
        return items.find(
          (item) => item.type === "NEW_MESSAGE" && item.messageId === posted.id,
        );
      });
      expect(newMessage.title).toBeTruthy();

      const mention = await waitFor(async () => {
        const items = await feedFor(secondMember);
        return items.find(
          (item) =>
            item.type === "MESSAGE_MENTION" && item.messageId === posted.id,
        );
      });
      expect(mention.title).toBeTruthy();

      // A mentioned member who is also a plain conversation member gets both.
      const secondMemberFeed = await feedFor(secondMember);
      expect(
        secondMemberFeed.some(
          (item) => item.type === "NEW_MESSAGE" && item.messageId === posted.id,
        ),
      ).toBe(true);

      const authorFeed = await feedFor(member);
      expect(authorFeed.some((item) => item.messageId === posted.id)).toBe(
        false,
      );

      // A mention naming someone who isn't actually a conversation member
      // must never surface a preview of content they have no API access to.
      // Give the relay several cycles, then assert absence - there is no
      // "eventually appears" signal to wait for here.
      await new Promise((resolve) =>
        setTimeout(resolve, 3 * RELAY_POLL_INTERVAL_MS),
      );
      const nonMemberFeed = await feedFor(management);
      expect(nonMemberFeed.some((item) => item.messageId === posted.id)).toBe(
        false,
      );
    },
  );

  it("rejects an unknown or non-mutable preference type, and honors a mute", async () => {
    const garbage = await as(
      member,
      "put",
      "/api/v1/notifications/preferences/NOT_A_TYPE",
    );
    expect(garbage.status).toBe(400);
    expect(body<{ code: string }>(garbage).code).toBe(
      "NOTIFICATION_TYPE_INVALID",
    );

    const notMutable = await as(
      member,
      "put",
      "/api/v1/notifications/preferences/TASK_ASSIGNED",
    );
    expect(notMutable.status).toBe(400);
    expect(body<{ code: string }>(notMutable).code).toBe(
      "NOTIFICATION_TYPE_NOT_MUTABLE",
    );

    const muted = await as(
      member,
      "put",
      "/api/v1/notifications/preferences/NEW_MESSAGE",
    );
    expect(muted.status).toBe(200);

    const prefs = body<{ items: Array<{ type: string; muted: boolean }> }>(
      await as(member, "get", "/api/v1/notifications/preferences"),
    );
    expect(prefs.items).toEqual(
      expect.arrayContaining([{ type: "NEW_MESSAGE", muted: true }]),
    );

    const conversation = body<{ id: string }>(
      await as(secondMember, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [member.id],
      }),
    );
    const posted = body<{ id: string }>(
      await as(
        secondMember,
        "post",
        `/api/v1/conversations/${conversation.id}/messages`,
      ).send({ content: "hello while muted" }),
    );

    // A muted type must not appear even after giving the relay several
    // cycles to process it - there is no "eventually appears" signal to
    // wait for here, so this is a fixed wait rather than `waitFor`.
    await new Promise((resolve) =>
      setTimeout(resolve, 3 * RELAY_POLL_INTERVAL_MS),
    );
    const mutedFeed = await feedFor(member);
    expect(mutedFeed.some((item) => item.messageId === posted.id)).toBe(false);

    const unmuted = await as(
      member,
      "delete",
      "/api/v1/notifications/preferences/NEW_MESSAGE",
    );
    expect(unmuted.status).toBe(200);
    const prefsAfter = body<{ items: Array<{ type: string; muted: boolean }> }>(
      await as(member, "get", "/api/v1/notifications/preferences"),
    );
    expect(prefsAfter.items).toEqual(
      expect.arrayContaining([{ type: "NEW_MESSAGE", muted: false }]),
    );
  });

  it(
    "refuses self-assignment and notifies no one",
    { timeout: 15_000 },
    async () => {
      const created = body<{ id: string }>(
        await as(management, "post", "/api/v1/tasks").send({
          title: "Self-assignment check",
          departmentId,
          workspaceId,
        }),
      );
      // A Department Manager may assign Members only, so self-assignment is
      // refused outright; the refusal must not notify anyone.
      await as(
        departmentManager,
        "put",
        `/api/v1/tasks/${created.id}/assignees/${departmentManager.id}`,
      ).expect(400);

      // No "eventually appears" signal for a negative assertion - give the
      // relay several cycles, then confirm absence.
      await new Promise((resolve) =>
        setTimeout(resolve, 3 * RELAY_POLL_INTERVAL_MS),
      );
      const feed = await feedFor(departmentManager);
      expect(
        feed.some(
          (item) => item.type === "TASK_ASSIGNED" && item.taskId === created.id,
        ),
      ).toBe(false);
    },
  );

  it("requires authentication and a CSRF token", async () => {
    const unauthenticated = await request(http).get("/api/v1/notifications");
    expect(unauthenticated.status).toBe(401);

    const missingCsrf = await request(http)
      .put(`/api/v1/notifications/${randomUUID()}/read`)
      .set("Cookie", member.cookies);
    expect(missingCsrf.status).toBe(403);
  });

  it("tells the new reviewer and the other participants when the reviewer changes, not the actor", async () => {
    const created = body<{ id: string }>(
      await as(management, "post", "/api/v1/tasks").send({
        title: "Reviewer notice check",
        departmentId,
        workspaceId,
        assigneeId: member.id,
      }),
    );
    const changed = await as(
      management,
      "put",
      `/api/v1/tasks/${created.id}/reviewer`,
    ).send({ reviewerId: departmentManager.id, reason: "Covering review" });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);

    const newReviewer = await waitFor(async () =>
      (await feedFor(departmentManager)).find(
        (item) =>
          item.type === "TASK_REVIEWER_CHANGED" && item.taskId === created.id,
      ),
    );
    expect(newReviewer.title).toBe(
      "You are now responsible for reviewing a task",
    );

    const assignee = await waitFor(async () =>
      (await feedFor(member)).find(
        (item) =>
          item.type === "TASK_REVIEWER_CHANGED" && item.taskId === created.id,
      ),
    );
    expect(assignee.title).toBe("The reviewer of a task you are on changed");

    // Give the relay time to deliver anything else, then confirm the actor was not told.
    await new Promise((resolve) =>
      setTimeout(resolve, 3 * RELAY_POLL_INTERVAL_MS),
    );
    expect(
      (await feedFor(management)).some(
        (item) =>
          item.type === "TASK_REVIEWER_CHANGED" && item.taskId === created.id,
      ),
    ).toBe(false);
  });
});
