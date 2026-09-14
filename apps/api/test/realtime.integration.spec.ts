import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PrismaClient,
  SessionRevocationReason,
  WorkspaceKind,
} from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
// `RealtimeService` transitively imports `DatabaseService`, which reads the
// `environment` singleton at first module load. A static top-level import
// here would lock that singleton's `DATABASE_URL` to whatever `.env` held at
// test-file-parse time - before `beforeAll` below points it at the isolated
// schema - so this stays a dynamic import, resolved only after that override.
import type { RealtimeService as RealtimeServiceType } from "../src/realtime/realtime.service.js";
import { roomName } from "../src/realtime/realtime.contracts.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";

interface Principal {
  cookies: string[];
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

describe("realtime gateway", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let baseUrl: string;
  let RealtimeService: typeof RealtimeServiceType;
  let credentialHash: string;

  async function seedUser(email: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email, credential: { create: { passwordHash: credentialHash } } },
    });
    return user.id;
  }
  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await prisma.userRoleAssignment.create({
      data: { userId, roleId: role.id },
    });
  }
  async function loginAs(email: string): Promise<Principal> {
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    return { cookies: setCookies(response) };
  }

  let superAdmin: Principal;
  let superAdminId: string;
  let plainUser: Principal;
  let workspaceId: string;

  const openSockets: Socket[] = [];

  function connect(principal: Principal): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        extraHeaders: { Cookie: cookieHeader(principal.cookies) },
        reconnection: false,
        forceNew: true,
      });
      openSockets.push(socket);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", (error: Error) => reject(error));
    });
  }

  function ack<T = unknown>(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<T> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (response: T) => resolve(response));
    });
  }

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "realtime-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "realtime-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    process.env.API_RATE_LIMIT_MAX = "100000";
    // Left at the real default (30/10s): the limiter is keyed by session id,
    // and several tests share the superAdmin/plainUser sessions in quick
    // succession, so a lowered threshold here would make unrelated tests
    // trip each other's budget. The dedicated rate-limit test below uses its
    // own session and drives it past the real default instead.

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);

    const [{ Test }, appModule, appSetup, hasherModule, realtimeModule] =
      await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module.js"),
        import("../src/app.setup.js"),
        import("../src/auth/domain/password-hasher.js"),
        import("../src/realtime/realtime.service.js"),
      ]);
    RealtimeService = realtimeModule.RealtimeService;
    credentialHash = await new hasherModule.PasswordHasher().hash(PASSWORD);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    await app.listen(0);
    http = app.getHttpServer();
    const address = http.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    superAdminId = await seedUser("realtime-admin@events.test");
    await assignRole(superAdminId, "Super Admin");
    superAdmin = await loginAs("realtime-admin@events.test");

    await seedUser("realtime-plain@events.test");
    plainUser = await loginAs("realtime-plain@events.test");

    const workspace = await prisma.workspace.create({
      data: { kind: WorkspaceKind.EVENT },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    for (const socket of openSockets) socket.close();
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("refuses the handshake for a request with no session cookie", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const socket = io(`${baseUrl}/realtime`, {
          reconnection: false,
          forceNew: true,
        });
        openSockets.push(socket);
        socket.once("connect", () => resolve("connected"));
        socket.once("connect_error", (error: Error) => reject(error));
      }),
    ).rejects.toThrow();
  });

  it("accepts an authenticated handshake and auto-joins the caller's own user room", async () => {
    const socket = await connect(superAdmin);
    expect(socket.connected).toBe(true);
  });

  it("subscribes to an authorized workspace room and rejects an unauthorized one", async () => {
    const admin = await connect(superAdmin);
    const authorized = await ack<{ ok: boolean; data?: { room: string } }>(
      admin,
      "room:subscribe",
      { version: 1, room: roomName("workspace", workspaceId) },
    );
    expect(authorized).toEqual({
      ok: true,
      data: { room: `workspace:${workspaceId}` },
    });

    const plain = await connect(plainUser);
    const denied = await ack<{
      ok: boolean;
      error?: { code: string };
    }>(plain, "room:subscribe", {
      version: 1,
      room: roomName("workspace", workspaceId),
    });
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("PERMISSION_DENIED");
  });

  it("404s a subscribe for an unknown workspace", async () => {
    const admin = await connect(superAdmin);
    const missing = "00000000-0000-0000-0000-000000000000";
    const response = await ack<{
      ok: boolean;
      error?: { code: string; message: string };
    }>(admin, "room:subscribe", {
      version: 1,
      room: roomName("workspace", missing),
    });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("NOT_FOUND");
    expect(typeof response.error?.message).toBe("string");
  });

  it("400s a malformed room command without disconnecting the socket", async () => {
    const admin = await connect(superAdmin);
    const response = await ack<{ ok: boolean; error?: { code: string } }>(
      admin,
      "room:subscribe",
      { version: 1, room: "not-a-room" },
    );
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("VALIDATION_ERROR");
    expect(admin.connected).toBe(true);
  });

  it("rejects a mixed-case room instead of silently joining a room nothing publishes to", async () => {
    const admin = await connect(superAdmin);
    const response = await ack<{ ok: boolean; error?: { code: string } }>(
      admin,
      "room:subscribe",
      { version: 1, room: `WORKSPACE:${workspaceId.toUpperCase()}` },
    );
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("VALIDATION_ERROR");
  });

  it("unsubscribes from a room", async () => {
    const admin = await connect(superAdmin);
    await ack(admin, "room:subscribe", {
      version: 1,
      room: roomName("workspace", workspaceId),
    });
    const response = await ack<{ ok: boolean; data?: { room: string } }>(
      admin,
      "room:unsubscribe",
      { version: 1, room: roomName("workspace", workspaceId) },
    );
    expect(response).toEqual({
      ok: true,
      data: { room: `workspace:${workspaceId}` },
    });
  });

  it("delivers a published envelope only to sockets in the target room", async () => {
    const recipient = await connect(superAdmin);
    const bystander = await connect(plainUser);

    const received: Promise<unknown> = new Promise((resolve) =>
      recipient.once("test.notice", resolve),
    );
    const bystanderReceived: unknown[] = [];
    bystander.on("test.notice", (envelope: unknown) =>
      bystanderReceived.push(envelope),
    );

    const realtime = app.get(RealtimeService);
    // Every socket auto-joins its own user room at handshake (ADR 0004 §4),
    // so publishing to the super admin's user room reaches only that socket.
    realtime.publish(
      roomName("user", superAdminId),
      "test.notice",
      1,
      { hello: "world" },
      "fixed-id-1",
    );

    const envelope = await received;
    expect(envelope).toMatchObject({
      event: "test.notice",
      version: 1,
      eventId: "fixed-id-1",
      room: `user:${superAdminId}`,
      payload: { hello: "world" },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bystanderReceived).toEqual([]);
  });

  it("rate-limits commands per connection", async () => {
    // A dedicated principal and session, so this test's budget can never be
    // partly consumed by another test sharing superAdmin's session, and this
    // test never eats into theirs. Drives the real configured default
    // (REALTIME_COMMAND_RATE_LIMIT_MAX, 30/10s) rather than a lowered
    // test-only threshold, for the same reason.
    const rateLimitedUserId = await seedUser(
      "realtime-rate-limited@events.test",
    );
    await assignRole(rateLimitedUserId, "Super Admin");
    const limitedUser = await loginAs("realtime-rate-limited@events.test");
    const socket = await connect(limitedUser);
    const room = roomName("workspace", workspaceId);

    for (let i = 0; i < 30; i += 1) {
      const response = await ack<{ ok: boolean }>(socket, "room:subscribe", {
        version: 1,
        room,
      });
      expect(response.ok).toBe(true);
    }

    const limited = await ack<{
      ok: boolean;
      error?: { code: string; message: string };
    }>(socket, "room:subscribe", { version: 1, room });
    expect(limited.ok).toBe(false);
    expect(limited.error?.code).toBe("RATE_LIMITED");
    expect(typeof limited.error?.message).toBe("string");
  });

  it("refuses to reconnect once the backing session has been revoked", async () => {
    const userId = await seedUser("realtime-revoked@events.test");
    await assignRole(userId, "Super Admin");
    const principal = await loginAs("realtime-revoked@events.test");

    const first = await connect(principal);
    expect(first.connected).toBe(true);

    await prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: SessionRevocationReason.ADMIN_REVOKED,
      },
    });

    await expect(connect(principal)).rejects.toThrow();
  });

  it("isolates delivery between two workspace rooms", async () => {
    const otherWorkspace = await prisma.workspace.create({
      data: { kind: WorkspaceKind.EVENT },
    });

    const subscriber = await connect(superAdmin);
    const bystander = await connect(superAdmin);

    await ack(subscriber, "room:subscribe", {
      version: 1,
      room: roomName("workspace", workspaceId),
    });
    await ack(bystander, "room:subscribe", {
      version: 1,
      room: roomName("workspace", otherWorkspace.id),
    });

    const received: Promise<unknown> = new Promise((resolve) =>
      subscriber.once("test.isolation", resolve),
    );
    const bystanderReceived: unknown[] = [];
    bystander.on("test.isolation", (envelope: unknown) =>
      bystanderReceived.push(envelope),
    );

    const realtime = app.get(RealtimeService);
    realtime.publish(roomName("workspace", workspaceId), "test.isolation", 1, {
      hello: "workspace-a-only",
    });

    await received;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bystanderReceived).toEqual([]);
  });

  it("treats a repeated subscribe to the same room as idempotent", async () => {
    const admin = await connect(superAdmin);
    const room = roomName("workspace", workspaceId);

    const first = await ack<{ ok: boolean; data?: { room: string } }>(
      admin,
      "room:subscribe",
      { version: 1, room },
    );
    const second = await ack<{ ok: boolean; data?: { room: string } }>(
      admin,
      "room:subscribe",
      { version: 1, room },
    );

    expect(first).toEqual({ ok: true, data: { room } });
    expect(second).toEqual({ ok: true, data: { room } });
  });

  it("does not carry a prior connection's room membership across a reconnect", async () => {
    const room = roomName("workspace", workspaceId);
    const first = await connect(superAdmin);
    await ack(first, "room:subscribe", { version: 1, room });
    first.close();

    const second = await connect(superAdmin);
    const secondReceived: unknown[] = [];
    second.on("test.reconnect", (envelope: unknown) =>
      secondReceived.push(envelope),
    );

    const realtime = app.get(RealtimeService);
    realtime.publish(room, "test.reconnect", 1, { hello: "world" });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondReceived).toEqual([]);
  });

  it("authorizes a workspace room using the read key for the workspace's own kind", async () => {
    const kinds = [
      WorkspaceKind.PROJECT,
      WorkspaceKind.PRODUCTION,
      WorkspaceKind.CAMPAIGN,
    ];
    const admin = await connect(superAdmin);

    for (const kind of kinds) {
      const workspace = await prisma.workspace.create({ data: { kind } });
      const response = await ack<{ ok: boolean; data?: { room: string } }>(
        admin,
        "room:subscribe",
        { version: 1, room: roomName("workspace", workspace.id) },
      );
      expect(response).toEqual({
        ok: true,
        data: { room: `workspace:${workspace.id}` },
      });
    }
  });

  it("denies the next subscribe once the caller's role is revoked mid-connection", async () => {
    const role = await prisma.role.create({
      data: { name: "Realtime Verification Reader" },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionKey: "event.read",
        scope: "ORGANIZATION",
      },
    });

    const userId = await seedUser("realtime-revoked-grant@events.test");
    await prisma.userRoleAssignment.create({
      data: { userId, roleId: role.id },
    });
    const principal = await loginAs("realtime-revoked-grant@events.test");
    const socket = await connect(principal);
    const room = roomName("workspace", workspaceId);

    const before = await ack<{ ok: boolean }>(socket, "room:subscribe", {
      version: 1,
      room,
    });
    expect(before.ok).toBe(true);

    await prisma.userRoleAssignment.delete({ where: { userId } });

    const after = await ack<{ ok: boolean; error?: { code: string } }>(
      socket,
      "room:subscribe",
      { version: 1, room },
    );
    expect(after.ok).toBe(false);
    expect(after.error?.code).toBe("PERMISSION_DENIED");
  });
});
