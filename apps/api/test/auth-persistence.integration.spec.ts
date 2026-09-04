import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SessionRow {
  [column: string]: unknown;
  id: string;
  family_id: string;
  refresh_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
  rotated_at: Date | null;
  replaced_by_session_id: string | null;
}

interface CredentialRow {
  [column: string]: unknown;
  failed_attempt_count: number;
  locked_until: Date | null;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(setCookie: string[], name: string): string {
  const header = setCookie.find((entry) => entry.startsWith(`${name}=`));
  const value = header?.slice(name.length + 1).split(";")[0];
  if (!value) {
    throw new Error(`cookie ${name} not present`);
  }
  return value;
}

describe("authentication persistence", () => {
  let db: IsolatedDatabase;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;
  let credentialHash: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "persistence-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "persistence-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";

    const [{ Test }, appModule, appSetup, hasherModule] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);

    credentialHash = await new hasherModule.PasswordHasher().hash(PASSWORD);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  async function seedUser(email: string): Promise<string> {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    await db.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [user!.id, credentialHash],
    );
    return user!.id;
  }

  async function login(email: string): Promise<string[]> {
    const response = await request(http)
      .post("/api/v1/auth/login")
      .set("User-Agent", "persistence-suite")
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    return setCookies(response);
  }

  async function sessionsFor(userId: string): Promise<SessionRow[]> {
    // `id` is a uuidv7 tiebreak so ordering is deterministic even when two
    // sessions share an `issued_at` timestamp.
    return db.query<SessionRow>(
      `SELECT id, family_id, refresh_token_hash, ip_address, user_agent,
              expires_at, revoked_at, revoked_reason, rotated_at,
              replaced_by_session_id
         FROM auth_sessions WHERE user_id = $1 ORDER BY issued_at, id`,
      [userId],
    );
  }

  it("stores a hashed refresh session with request metadata on login", async () => {
    const userId = await seedUser("persist-login@e2e.test");
    const cookies = await login("persist-login@e2e.test");
    const rawRefresh = cookieValue(cookies, "refresh_token");

    const [session] = await sessionsFor(userId);
    expect(session).toBeDefined();
    expect(session!.refresh_token_hash).toMatch(SHA256_HEX);
    expect(session!.refresh_token_hash).not.toEqual(rawRefresh);
    expect(session!.family_id).toMatch(UUID);
    expect(session!.user_agent).toBe("persistence-suite");
    expect(session!.ip_address).toBeTruthy();
    expect(session!.revoked_at).toBeNull();
    const ttlDays = (session!.expires_at.getTime() - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(29);
    expect(ttlDays).toBeLessThan(31);
  });

  it("tracks and clears the failed-attempt counter", async () => {
    const userId = await seedUser("persist-counter@e2e.test");

    for (let i = 0; i < 3; i += 1) {
      await request(http)
        .post("/api/v1/auth/login")
        .send({ email: "persist-counter@e2e.test", password: "the wrong one" });
    }
    const [afterFailures] = await db.query<CredentialRow>(
      `SELECT failed_attempt_count, locked_until FROM user_credentials WHERE user_id = $1`,
      [userId],
    );
    expect(afterFailures!.failed_attempt_count).toBe(3);
    expect(afterFailures!.locked_until).toBeNull();

    await login("persist-counter@e2e.test");
    const [afterSuccess] = await db.query<CredentialRow>(
      `SELECT failed_attempt_count, locked_until FROM user_credentials WHERE user_id = $1`,
      [userId],
    );
    expect(afterSuccess!.failed_attempt_count).toBe(0);
    expect(afterSuccess!.locked_until).toBeNull();
  });

  it("sets locked_until once the attempt ceiling is reached", async () => {
    const userId = await seedUser("persist-lock@e2e.test");
    for (let i = 0; i < 10; i += 1) {
      await request(http)
        .post("/api/v1/auth/login")
        .send({ email: "persist-lock@e2e.test", password: "the wrong one" });
    }
    const [row] = await db.query<CredentialRow>(
      `SELECT failed_attempt_count, locked_until FROM user_credentials WHERE user_id = $1`,
      [userId],
    );
    expect(row!.failed_attempt_count).toBe(10);
    expect(row!.locked_until).toBeInstanceOf(Date);
    expect(row!.locked_until!.getTime()).toBeGreaterThan(Date.now());
  });

  it("links the old and new session on refresh and keeps the family", async () => {
    const userId = await seedUser("persist-rotate@e2e.test");
    const cookies = await login("persist-rotate@e2e.test");
    const refresh = cookieValue(cookies, "refresh_token");
    const csrf = cookieValue(cookies, "csrf_token");

    const rotate = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", csrf);
    expect(rotate.status).toBe(200);

    const sessions = await sessionsFor(userId);
    expect(sessions).toHaveLength(2);
    const [previous, next] = sessions;
    expect(previous!.revoked_at).toBeInstanceOf(Date);
    expect(previous!.revoked_reason).toBe("ROTATED");
    expect(previous!.rotated_at).toBeInstanceOf(Date);
    expect(previous!.replaced_by_session_id).toBe(next!.id);
    expect(next!.family_id).toBe(previous!.family_id);
    expect(next!.refresh_token_hash).not.toEqual(previous!.refresh_token_hash);
    expect(next!.revoked_at).toBeNull();
  });

  it("revokes every session in the family when a spent token is replayed", async () => {
    const userId = await seedUser("persist-reuse@e2e.test");
    const cookies = await login("persist-reuse@e2e.test");
    const refresh = cookieValue(cookies, "refresh_token");
    const csrf = cookieValue(cookies, "csrf_token");

    await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", csrf);
    const replay = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", csrf);
    expect(replay.status).toBe(401);

    const sessions = await sessionsFor(userId);
    expect(sessions.every((session) => session.revoked_at !== null)).toBe(true);
    expect(
      sessions.some((session) => session.revoked_reason === "REUSE_DETECTED"),
    ).toBe(true);
  });

  it("records the logout reason on the session", async () => {
    const userId = await seedUser("persist-logout@e2e.test");
    const cookies = await login("persist-logout@e2e.test");
    const csrf = cookieValue(cookies, "csrf_token");

    const logout = await request(http)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf);
    expect(logout.status).toBe(204);

    const [session] = await sessionsFor(userId);
    expect(session!.revoked_at).toBeInstanceOf(Date);
    expect(session!.revoked_reason).toBe("LOGOUT");
  });

  it("gives each login its own session family", async () => {
    const userId = await seedUser("persist-families@e2e.test");
    await login("persist-families@e2e.test");
    await login("persist-families@e2e.test");

    const sessions = await sessionsFor(userId);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.family_id).not.toEqual(sessions[1]!.family_id);
  });

  it("keeps at most one live successor under concurrent refresh", async () => {
    const userId = await seedUser("persist-concurrent@e2e.test");
    const cookies = await login("persist-concurrent@e2e.test");
    const refresh = cookieValue(cookies, "refresh_token");
    const csrf = cookieValue(cookies, "csrf_token");

    const attempt = () =>
      request(http)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
        .set("x-csrf-token", csrf);
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);

    const sessions = await sessionsFor(userId);
    const live = sessions.filter((session) => session.revoked_at === null);
    expect(live.length).toBeLessThanOrEqual(1);
    const hashes = new Set(sessions.map((s) => s.refresh_token_hash));
    expect(hashes.size).toBe(sessions.length);
  });
});
