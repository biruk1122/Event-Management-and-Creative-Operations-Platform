import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const PASSWORD = "correct horse battery staple";
const ACTIVE_EMAIL = "active@e2e.test";
const INACTIVE_EMAIL = "inactive@e2e.test";

interface ProblemBody {
  code: string;
  status: number;
}
interface UserBody {
  id: string;
  email: string;
  status: string;
}
interface SessionBody {
  user: UserBody;
}
interface OpenApiBody {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
}

function body<T>(response: request.Response): T {
  return response.body as T;
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(setCookie: string[], name: string): string | undefined {
  const header = setCookie.find((entry) => entry.startsWith(`${name}=`));
  if (!header) {
    return undefined;
  }
  const value = header.slice(name.length + 1).split(";")[0];
  return value && value.length > 0 ? value : undefined;
}

describe("authentication API", () => {
  let db: IsolatedDatabase;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "integration-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "integration-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";

    const [{ Test }, appModule, appSetup, hasherModule] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
      import("../src/auth/domain/password-hasher.js"),
    ]);

    const passwordHash = await new hasherModule.PasswordHasher().hash(PASSWORD);
    await seedAccount(db, ACTIVE_EMAIL, passwordHash, "ACTIVE");
    await seedAccount(db, INACTIVE_EMAIL, passwordHash, "INACTIVE");

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

  it("rejects a malformed login body with VALIDATION_ERROR", async () => {
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(body<ProblemBody>(response)).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });

  it("rejects unknown and wrong credentials with the same code", async () => {
    const unknown = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@e2e.test", password: PASSWORD });
    const wrong = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: "the wrong password" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(body<ProblemBody>(unknown).code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(body<ProblemBody>(wrong).code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects an inactive account with AUTH_ACCOUNT_INACTIVE", async () => {
    const response = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: INACTIVE_EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(body<ProblemBody>(response).code).toBe("AUTH_ACCOUNT_INACTIVE");
  });

  it("issues session cookies on a successful login and serves /me", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });

    expect(login.status).toBe(200);
    expect(body<SessionBody>(login)).toMatchObject({
      user: { email: ACTIVE_EMAIL, status: "ACTIVE" },
    });
    const cookies = setCookies(login);
    expect(cookieValue(cookies, "access_token")).toBeTruthy();
    expect(cookieValue(cookies, "refresh_token")).toBeTruthy();
    expect(cookieValue(cookies, "csrf_token")).toBeTruthy();

    const me = await request(http)
      .get("/api/v1/auth/me")
      .set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(body<UserBody>(me)).toMatchObject({
      email: ACTIVE_EMAIL,
      status: "ACTIVE",
    });
  });

  it("requires authentication for /me", async () => {
    const response = await request(http).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
    expect(body<ProblemBody>(response).code).toBe("AUTH_UNAUTHENTICATED");
  });

  it("rotates the session on refresh and detects reuse of a spent token", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const firstCookies = setCookies(login);
    const refreshOne = cookieValue(firstCookies, "refresh_token")!;
    const csrfOne = cookieValue(firstCookies, "csrf_token")!;

    const rotate = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshOne}`, `csrf_token=${csrfOne}`])
      .set("x-csrf-token", csrfOne);
    expect(rotate.status).toBe(200);
    const secondCookies = setCookies(rotate);
    const refreshTwo = cookieValue(secondCookies, "refresh_token")!;
    const csrfTwo = cookieValue(secondCookies, "csrf_token")!;
    expect(refreshTwo).not.toEqual(refreshOne);

    // Replaying the spent token trips reuse detection and revokes the family.
    const replay = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshOne}`, `csrf_token=${csrfOne}`])
      .set("x-csrf-token", csrfOne);
    expect(replay.status).toBe(401);
    expect(body<ProblemBody>(replay).code).toBe("AUTH_SESSION_REUSE_DETECTED");

    const afterRevoke = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshTwo}`, `csrf_token=${csrfTwo}`])
      .set("x-csrf-token", csrfTwo);
    expect(afterRevoke.status).toBe(401);
    expect(body<ProblemBody>(afterRevoke).code).toBe("AUTH_INVALID_SESSION");
  });

  it("lets only one of two concurrent refreshes with the same token win", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const cookies = setCookies(login);
    const refresh = cookieValue(cookies, "refresh_token")!;
    const csrf = cookieValue(cookies, "csrf_token")!;

    const attempt = () =>
      request(http)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
        .set("x-csrf-token", csrf);

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 401]);
    const failure = first.status === 401 ? first : second;
    expect(body<ProblemBody>(failure).code).toBe("AUTH_SESSION_REUSE_DETECTED");
  });

  it("rejects refresh without a matching CSRF header", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const cookies = setCookies(login);
    const refresh = cookieValue(cookies, "refresh_token")!;
    const csrf = cookieValue(cookies, "csrf_token")!;

    const noHeader = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`]);
    expect(noHeader.status).toBe(403);
    expect(body<ProblemBody>(noHeader).code).toBe("CSRF_TOKEN_INVALID");
  });

  it("revokes the session on logout", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const cookies = setCookies(login);
    const refresh = cookieValue(cookies, "refresh_token")!;
    const csrf = cookieValue(cookies, "csrf_token")!;

    const logout = await request(http)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrf);
    expect(logout.status).toBe(204);

    const me = await request(http)
      .get("/api/v1/auth/me")
      .set("Cookie", cookies);
    expect(me.status).toBe(401);

    const refreshAfter = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", csrf);
    expect(refreshAfter.status).toBe(401);
    expect(body<ProblemBody>(refreshAfter).code).toBe("AUTH_INVALID_SESSION");
  });

  it("locks an account after repeated failures", async () => {
    const { PasswordHasher } =
      await import("../src/auth/domain/password-hasher.js");
    await seedAccount(
      db,
      "lockme@e2e.test",
      await new PasswordHasher().hash(PASSWORD),
      "ACTIVE",
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(http)
        .post("/api/v1/auth/login")
        .send({ email: "lockme@e2e.test", password: "the wrong password" });
    }

    const afterLock = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "lockme@e2e.test", password: PASSWORD });
    expect(afterLock.status).toBe(403);
    expect(body<ProblemBody>(afterLock).code).toBe("AUTH_ACCOUNT_LOCKED");
  });

  it("documents the auth routes in the OpenAPI contract", async () => {
    const response = await request(http).get("/api/docs-json");
    expect(response.status).toBe(200);
    const document = body<OpenApiBody>(response);
    for (const path of [
      "/api/v1/auth/login",
      "/api/v1/auth/refresh",
      "/api/v1/auth/logout",
      "/api/v1/auth/me",
    ]) {
      expect(document.paths).toHaveProperty(path);
    }
    expect(document.components.schemas).toHaveProperty("SessionResponse");
    expect(document.components.schemas).toHaveProperty("ProblemDetails");
  });

  it("sets the expected cookie attributes on login", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const raw = setCookies(login);

    const access = raw.find((c) => c.startsWith("access_token="))!;
    const refresh = raw.find((c) => c.startsWith("refresh_token="))!;
    const csrf = raw.find((c) => c.startsWith("csrf_token="))!;

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\/(;|$)/);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it("validates each login field", async () => {
    const cases = [
      { email: ACTIVE_EMAIL },
      { password: PASSWORD },
      { email: ACTIVE_EMAIL, password: "short" },
      { email: ACTIVE_EMAIL, password: "x".repeat(500) },
      { email: 42, password: PASSWORD },
    ];
    for (const payload of cases) {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send(payload);
      expect(response.status).toBe(400);
      expect(body<ProblemBody>(response).code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects refresh with a missing or unknown token", async () => {
    const missing = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", ["csrf_token=abc"])
      .set("x-csrf-token", "abc");
    expect(missing.status).toBe(401);
    expect(body<ProblemBody>(missing).code).toBe("AUTH_INVALID_SESSION");

    const unknown = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", ["refresh_token=not-a-real-token", "csrf_token=abc"])
      .set("x-csrf-token", "abc");
    expect(unknown.status).toBe(401);
    expect(body<ProblemBody>(unknown).code).toBe("AUTH_INVALID_SESSION");
  });

  it("rejects refresh when the CSRF header and cookie disagree", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const cookies = setCookies(login);
    const refresh = cookieValue(cookies, "refresh_token")!;
    const csrf = cookieValue(cookies, "csrf_token")!;

    const mismatch = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", `${csrf}tampered`);
    expect(mismatch.status).toBe(403);
    expect(body<ProblemBody>(mismatch).code).toBe("CSRF_TOKEN_INVALID");
  });

  it("stops honouring the session once the account is deactivated", async () => {
    const userId = await seedAccount(
      db,
      "deactivate@e2e.test",
      await hashFor(PASSWORD),
      "ACTIVE",
    );
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "deactivate@e2e.test", password: PASSWORD });
    const cookies = setCookies(login);
    const refresh = cookieValue(cookies, "refresh_token")!;
    const csrf = cookieValue(cookies, "csrf_token")!;

    await db.query(
      `UPDATE users SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`,
      [userId],
    );

    const me = await request(http)
      .get("/api/v1/auth/me")
      .set("Cookie", cookies);
    expect(me.status).toBe(401);

    const refreshed = await request(http)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${refresh}`, `csrf_token=${csrf}`])
      .set("x-csrf-token", csrf);
    expect(refreshed.status).toBe(401);
    expect(body<ProblemBody>(refreshed).code).toBe("AUTH_INVALID_SESSION");
  });

  it("returns exactly id, email and status from /me", async () => {
    const login = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: ACTIVE_EMAIL, password: PASSWORD });
    const me = await request(http)
      .get("/api/v1/auth/me")
      .set("Cookie", setCookies(login));

    expect(me.status).toBe(200);
    expect(Object.keys(body<UserBody>(me)).sort()).toEqual([
      "email",
      "id",
      "status",
    ]);
  });
});

describe("authentication rate limiting", () => {
  let db: IsolatedDatabase;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "integration-access-token-secret-at-least-32-chars";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "integration-refresh-token-secret-at-least-32-chars";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "3";
    // Re-evaluate the config module so the new limit takes effect.
    vi.resetModules();

    const [{ Test }, appModule, appSetup] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/app.setup.js"),
    ]);
    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    appSetup.configureApplication(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "10000";
    await app?.close();
    await db?.drop();
  });

  it("returns AUTH_RATE_LIMITED after the per-IP login ceiling", async () => {
    let sawLimit = false;
    for (let i = 0; i < 6; i += 1) {
      const response = await request(http)
        .post("/api/v1/auth/login")
        .send({ email: "rl@e2e.test", password: "the wrong password" });
      if (response.status === 429) {
        expect(body<ProblemBody>(response).code).toBe("AUTH_RATE_LIMITED");
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});

async function hashFor(password: string): Promise<string> {
  const { PasswordHasher } =
    await import("../src/auth/domain/password-hasher.js");
  return new PasswordHasher().hash(password);
}

async function seedAccount(
  db: IsolatedDatabase,
  email: string,
  passwordHash: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<string> {
  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email, status, deactivated_at) VALUES ($1, $2, $3) RETURNING id`,
    [email, status, status === "INACTIVE" ? new Date() : null],
  );
  await db.query(
    `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
    [user!.id, passwordHash],
  );
  return user!.id;
}
