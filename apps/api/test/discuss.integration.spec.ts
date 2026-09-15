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

class DiscussFileStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();

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

class CleanDiscussFileScanner implements FileScanner {
  scan() {
    return Promise.resolve<"clean">("clean");
  }
}

interface Principal {
  id: string;
  cookies: string[];
  csrfToken: string;
}

interface ConversationBody {
  id: string;
  type: string;
  name: string | null;
  visibility: string | null;
  workspaceId: string | null;
  departmentId: string | null;
  teamId: string | null;
  members: Array<{ id: string }>;
}

interface MessageBody {
  id: string;
  conversationId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
  mentionedUsers: Array<{ id: string }>;
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

describe("discuss (conversations, channels, and messages) API", () => {
  let database: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;
  let superAdmin: Principal;
  let management: Principal;
  let departmentManager: Principal;
  let otherDepartmentManager: Principal;
  let member: Principal;
  let secondMember: Principal;
  let thirdMember: Principal;
  let departmentId: string;
  let otherDepartmentId: string;
  let scanner: CleanDiscussFileScanner;
  let storage: DiscussFileStorage;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "discuss-access-token-secret-at-least-32-characters";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "discuss-refresh-token-secret-at-least-32-characters";
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
    storage = new DiscussFileStorage();
    scanner = new CleanDiscussFileScanner();
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
      data: { name: "Discuss Production" },
    });
    const otherDepartment = await prisma.department.create({
      data: { name: "Discuss Marketing" },
    });
    departmentId = department.id;
    otherDepartmentId = otherDepartment.id;

    superAdmin = await createPrincipal(
      "super-admin@discuss.test",
      "Super Admin",
    );
    management = await createPrincipal(
      "management@discuss.test",
      "Management/Administrator",
    );
    departmentManager = await createPrincipal(
      "department-manager@discuss.test",
      "Department Manager",
      department.id,
    );
    otherDepartmentManager = await createPrincipal(
      "other-manager@discuss.test",
      "Department Manager",
      otherDepartment.id,
    );
    member = await createPrincipal(
      "member@discuss.test",
      "Team Member",
      department.id,
    );
    secondMember = await createPrincipal(
      "second-member@discuss.test",
      "Team Member",
      department.id,
    );
    thirdMember = await createPrincipal(
      "third-member@discuss.test",
      "Team Member",
      otherDepartment.id,
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

  it("supports a direct conversation's messaging lifecycle", async () => {
    const created = await as(member, "post", "/api/v1/conversations").send({
      type: "DIRECT",
      memberIds: [secondMember.id],
    });
    expect(created.status).toBe(201);
    const conversation = body<ConversationBody>(created);
    expect(conversation.type).toBe("DIRECT");
    expect(conversation.members.map((m) => m.id).sort()).toEqual(
      [member.id, secondMember.id].sort(),
    );

    const posted = await as(
      member,
      "post",
      `/api/v1/conversations/${conversation.id}/messages`,
    ).send({ content: "The venue is confirmed.", mentionedUserIds: [] });
    expect(posted.status).toBe(201);
    const message = body<MessageBody>(posted);
    expect(message.content).toBe("The venue is confirmed.");

    const listed = await as(
      secondMember,
      "get",
      `/api/v1/conversations/${conversation.id}/messages`,
    );
    expect(listed.status).toBe(200);
    expect(
      body<{ items: MessageBody[] }>(listed).items.map((m) => m.id),
    ).toContain(message.id);

    const readCursor = await as(
      secondMember,
      "put",
      `/api/v1/conversations/${conversation.id}/read-cursor`,
    ).send({ messageId: message.id });
    expect(readCursor.status).toBe(200);

    const pinned = await as(
      secondMember,
      "put",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/pin`,
    );
    expect(pinned.status).toBe(200);
    expect(body<MessageBody>(pinned).pinnedAt).not.toBeNull();

    const unpinned = await as(
      secondMember,
      "delete",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/pin`,
    );
    expect(unpinned.status).toBe(200);
    expect(body<MessageBody>(unpinned).pinnedAt).toBeNull();

    const edited = await as(
      member,
      "patch",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}`,
    ).send({ content: "The venue is confirmed for Saturday." });
    expect(edited.status).toBe(200);
    expect(body<MessageBody>(edited).editedAt).not.toBeNull();

    const editedBySomeoneElse = await as(
      secondMember,
      "patch",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}`,
    ).send({ content: "Not the author." });
    expect(editedBySomeoneElse.status).toBe(403);

    const outsider = await as(
      departmentManager,
      "post",
      `/api/v1/conversations/${conversation.id}/messages`,
    ).send({ content: "I should not be able to post here." });
    expect(outsider.status).toBe(409);
    expect(body<{ code: string }>(outsider).code).toBe(
      "CONVERSATION_NOT_MEMBER",
    );

    const deleted = await as(
      member,
      "delete",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}`,
    );
    expect(deleted.status).toBe(200);
    expect(body<MessageBody>(deleted)).toMatchObject({
      content: "",
      deletedAt: expect.any(String) as string,
    });
  });

  it("rejects a direct conversation without exactly one other member", async () => {
    const response = await as(member, "post", "/api/v1/conversations").send({
      type: "DIRECT",
      memberIds: [secondMember.id, thirdMember.id],
    });
    expect(response.status).toBe(400);
    expect(body<{ code: string }>(response).code).toBe(
      "DIRECT_CONVERSATION_MEMBER_COUNT",
    );
  });

  it("rejects a message reply to a message from a different conversation", async () => {
    const conversationA = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const conversationB = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [thirdMember.id],
      }),
    );
    const messageInA = body<MessageBody>(
      await as(
        member,
        "post",
        `/api/v1/conversations/${conversationA.id}/messages`,
      ).send({ content: "Only in A" }),
    );
    const reply = await as(
      member,
      "post",
      `/api/v1/conversations/${conversationB.id}/messages`,
    ).send({
      content: "Replying across conversations",
      parentMessageId: messageInA.id,
    });
    expect(reply.status).toBe(404);
    expect(body<{ code: string }>(reply).code).toBe("MESSAGE_PARENT_NOT_FOUND");
  });

  it("lets an existing group member grow the group, but not edit or delete another member's message across conversations", async () => {
    const group = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "GROUP",
        memberIds: [secondMember.id],
      }),
    );

    const grown = await as(
      secondMember,
      "put",
      `/api/v1/conversations/${group.id}/members/${thirdMember.id}`,
    );
    expect(grown.status).toBe(200);
    expect(body<ConversationBody>(grown).members.map((m) => m.id)).toContain(
      thirdMember.id,
    );

    const outsiderGrow = await as(
      departmentManager,
      "put",
      `/api/v1/conversations/${group.id}/members/${departmentManager.id}`,
    );
    expect(outsiderGrow.status).toBe(403);

    const otherConversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const groupMessage = body<MessageBody>(
      await as(
        member,
        "post",
        `/api/v1/conversations/${group.id}/messages`,
      ).send({ content: "Original group message." }),
    );

    const crossConversationEdit = await as(
      member,
      "patch",
      `/api/v1/conversations/${otherConversation.id}/messages/${groupMessage.id}`,
    ).send({ content: "Should not apply through the wrong conversation." });
    expect(crossConversationEdit.status).toBe(404);
    expect(body<{ code: string }>(crossConversationEdit).code).toBe(
      "MESSAGE_NOT_FOUND",
    );

    const stillOriginal = await as(
      member,
      "get",
      `/api/v1/conversations/${group.id}/messages`,
    );
    expect(
      body<{ items: MessageBody[] }>(stillOriginal).items.find(
        (m) => m.id === groupMessage.id,
      )?.content,
    ).toBe("Original group message.");
  });

  it("rejects a mention of a user that does not exist", async () => {
    const conversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const response = await as(
      member,
      "post",
      `/api/v1/conversations/${conversation.id}/messages`,
    ).send({ content: "cc someone missing", mentionedUserIds: [randomUUID()] });
    expect(response.status).toBe(404);
    expect(body<{ code: string }>(response).code).toBe(
      "DISCUSS_USER_NOT_FOUND",
    );
  });

  it("scopes channel creation and management by owner", async () => {
    const generalChannel = await as(
      management,
      "post",
      "/api/v1/conversations/channels",
    ).send({ name: "Announcements", visibility: "PUBLIC" });
    expect(generalChannel.status).toBe(201);

    const deniedGeneral = await as(
      departmentManager,
      "post",
      "/api/v1/conversations/channels",
    ).send({ name: "Should not exist", visibility: "PUBLIC" });
    expect(deniedGeneral.status).toBe(403);

    const deptChannel = await as(
      departmentManager,
      "post",
      "/api/v1/conversations/channels",
    ).send({
      name: "Production planning",
      visibility: "PRIVATE",
      departmentId,
    });
    expect(deptChannel.status).toBe(201);
    const deptChannelBody = body<ConversationBody>(deptChannel);
    expect(deptChannelBody.departmentId).toBe(departmentId);

    const wrongDeptChannel = await as(
      departmentManager,
      "post",
      "/api/v1/conversations/channels",
    ).send({
      name: "Should not exist either",
      visibility: "PRIVATE",
      departmentId: otherDepartmentId,
    });
    expect(wrongDeptChannel.status).toBe(403);

    const multiOwner = await as(
      management,
      "post",
      "/api/v1/conversations/channels",
    ).send({
      name: "Invalid owner",
      visibility: "PUBLIC",
      departmentId,
      teamId: randomUUID(),
    });
    expect(multiOwner.status).toBe(400);
    expect(body<{ code: string }>(multiOwner).code).toBe(
      "CHANNEL_OWNER_INVALID",
    );

    const rename = await as(
      departmentManager,
      "patch",
      `/api/v1/conversations/${deptChannelBody.id}`,
    ).send({ name: "Production planning (renamed)" });
    expect(rename.status).toBe(200);
    expect(body<ConversationBody>(rename).name).toBe(
      "Production planning (renamed)",
    );

    const renameDeniedForOtherManager = await as(
      otherDepartmentManager,
      "patch",
      `/api/v1/conversations/${deptChannelBody.id}`,
    ).send({ name: "Hijacked" });
    expect(renameDeniedForOtherManager.status).toBe(403);

    const addMember = await as(
      departmentManager,
      "put",
      `/api/v1/conversations/${deptChannelBody.id}/members/${member.id}`,
    );
    expect(addMember.status).toBe(200);
    expect(
      body<ConversationBody>(addMember).members.map((m) => m.id),
    ).toContain(member.id);

    const selfJoinPrivateDenied = await as(
      secondMember,
      "put",
      `/api/v1/conversations/${deptChannelBody.id}/members/${secondMember.id}`,
    );
    expect(selfJoinPrivateDenied.status).toBe(403);

    const selfJoinPublic = await as(
      secondMember,
      "put",
      `/api/v1/conversations/${body<ConversationBody>(generalChannel).id}/members/${secondMember.id}`,
    );
    expect(selfJoinPublic.status).toBe(200);

    const removeMember = await as(
      departmentManager,
      "delete",
      `/api/v1/conversations/${deptChannelBody.id}/members/${member.id}`,
    );
    expect(removeMember.status).toBe(200);
    expect(
      body<ConversationBody>(removeMember).members.map((m) => m.id),
    ).not.toContain(member.id);
  });

  it("supports the message attachment upload, finalize, list, and download flow", async () => {
    const conversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const message = body<MessageBody>(
      await as(
        member,
        "post",
        `/api/v1/conversations/${conversation.id}/messages`,
      ).send({ content: "See attached." }),
    );

    const bytes = Buffer.from("\xff\xd8\xffjpeg-body", "binary");
    const intentResponse = await as(
      member,
      "post",
      `/api/v1/conversations/${conversation.id}/files/upload-intents`,
    ).send({
      filename: "photo.jpg",
      mediaType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });
    expect(intentResponse.status).toBe(201);
    const intent = body<{
      id: string;
      upload: { fields: Record<string, string> };
    }>(intentResponse);
    const storageKey = intent.upload.fields.key;
    if (!storageKey) throw new Error("message upload intent omitted its key");
    storage.objects.set(storageKey, {
      bytes,
      mediaType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });

    const storedIntent = await prisma.managedFile.findUniqueOrThrow({
      where: { id: intent.id },
      select: { intentConversationId: true, intentTaskId: true },
    });
    expect(storedIntent).toEqual({
      intentConversationId: conversation.id,
      intentTaskId: null,
    });

    const finalized = await as(
      member,
      "post",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files/${intent.id}/finalize`,
    );
    expect(finalized.status).toBe(200);
    expect(body<{ id: string; state: string }>(finalized)).toMatchObject({
      id: intent.id,
      state: "available",
    });

    const listedFiles = await as(
      secondMember,
      "get",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files`,
    );
    expect(listedFiles.status).toBe(200);
    expect(
      body<{ items: Array<{ id: string }>; total: number }>(listedFiles),
    ).toMatchObject({
      items: [expect.objectContaining({ id: intent.id })],
      total: 1,
    });

    const downloaded = await as(
      secondMember,
      "get",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files/${intent.id}/download`,
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");

    const outsiderDownload = await as(
      departmentManager,
      "get",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files/${intent.id}/download`,
    );
    expect(outsiderDownload.status).toBe(403);

    const missingFileDownload = await as(
      secondMember,
      "get",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files/${randomUUID()}/download`,
    );
    expect(missingFileDownload.status).toBe(404);
    expect(body<{ code: string }>(missingFileDownload).code).toBe(
      "FILE_NOT_FOUND",
    );
  });

  it("rejects unauthenticated requests and out-of-range pagination", async () => {
    const unauthenticated = await request(http).get("/api/v1/conversations");
    expect(unauthenticated.status).toBe(401);

    const invalidPage = await as(member, "get", "/api/v1/conversations?page=0");
    expect(invalidPage.status).toBe(400);

    const conversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const invalidMessagePage = await as(
      member,
      "get",
      `/api/v1/conversations/${conversation.id}/messages?pageSize=0`,
    );
    expect(invalidMessagePage.status).toBe(400);
  });

  it("returns stable not-found codes for a missing conversation or message", async () => {
    const missingId = randomUUID();

    // A caller with no organization-wide grant cannot distinguish "does not
    // exist" from "exists but I cannot see it" - both read as forbidden.
    const missingConversationForMember = await as(
      member,
      "get",
      `/api/v1/conversations/${missingId}`,
    );
    expect(missingConversationForMember.status).toBe(403);
    expect(body<{ code: string }>(missingConversationForMember).code).toBe(
      "PERMISSION_DENIED",
    );

    const missingConversation = await as(
      superAdmin,
      "get",
      `/api/v1/conversations/${missingId}`,
    );
    expect(missingConversation.status).toBe(404);
    expect(body<{ code: string }>(missingConversation).code).toBe(
      "CONVERSATION_NOT_FOUND",
    );

    const conversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const missingMessageEdit = await as(
      member,
      "patch",
      `/api/v1/conversations/${conversation.id}/messages/${randomUUID()}`,
    ).send({ content: "no such message" });
    expect(missingMessageEdit.status).toBe(404);
    expect(body<{ code: string }>(missingMessageEdit).code).toBe(
      "MESSAGE_NOT_FOUND",
    );

    const missingReadCursorTarget = await as(
      member,
      "put",
      `/api/v1/conversations/${conversation.id}/read-cursor`,
    ).send({ messageId: randomUUID() });
    expect(missingReadCursorTarget.status).toBe(404);
    expect(body<{ code: string }>(missingReadCursorTarget).code).toBe(
      "MESSAGE_NOT_FOUND",
    );
  });

  it("rolls back the attachment finalize transaction cleanly on a mid-transaction failure", async () => {
    const conversation = body<ConversationBody>(
      await as(member, "post", "/api/v1/conversations").send({
        type: "DIRECT",
        memberIds: [secondMember.id],
      }),
    );
    const message = body<MessageBody>(
      await as(
        member,
        "post",
        `/api/v1/conversations/${conversation.id}/messages`,
      ).send({ content: "Rollback target." }),
    );
    const bytes = Buffer.from("\xff\xd8\xffrollback-body", "binary");
    const intentResponse = await as(
      member,
      "post",
      `/api/v1/conversations/${conversation.id}/files/upload-intents`,
    ).send({
      filename: "rollback.jpg",
      mediaType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });
    expect(intentResponse.status).toBe(201);
    const intent = body<{
      id: string;
      upload: { fields: Record<string, string> };
    }>(intentResponse);
    const storageKey = intent.upload.fields.key;
    if (!storageKey) throw new Error("rollback upload intent omitted its key");
    storage.objects.set(storageKey, {
      bytes,
      mediaType: "image/jpeg",
      sizeBytes: bytes.byteLength,
    });

    await database.query(`
      CREATE FUNCTION force_message_attachment_failure() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced message attachment failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.query(`
      CREATE TRIGGER force_message_attachment_failure
      BEFORE INSERT ON message_attachments
      FOR EACH ROW EXECUTE FUNCTION force_message_attachment_failure();
    `);
    try {
      await as(
        member,
        "post",
        `/api/v1/conversations/${conversation.id}/messages/${message.id}/files/${intent.id}/finalize`,
      ).expect(500);
      expect(
        await prisma.managedFile.findUniqueOrThrow({
          where: { id: intent.id },
          select: { state: true },
        }),
      ).toEqual({ state: "PENDING" });
      expect(
        await prisma.messageAttachment.count({
          where: { managedFileId: intent.id },
        }),
      ).toBe(0);
    } finally {
      await database.query(
        "DROP TRIGGER force_message_attachment_failure ON message_attachments",
      );
      await database.query("DROP FUNCTION force_message_attachment_failure()");
    }

    const stillPending = await as(
      member,
      "get",
      `/api/v1/conversations/${conversation.id}/messages/${message.id}/files`,
    );
    expect(stillPending.status).toBe(200);
    expect(
      body<{ items: Array<{ id: string }>; total: number }>(stillPending).total,
    ).toBe(0);
  });
});
