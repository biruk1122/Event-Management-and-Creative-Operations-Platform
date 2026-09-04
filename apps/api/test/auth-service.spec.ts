import { HttpException } from "@nestjs/common";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_ERROR } from "../src/auth/auth.errors.js";
import { AuthService } from "../src/auth/auth.service.js";
import type {
  AccountRecord,
  SessionRecord,
} from "../src/auth/infrastructure/auth.repository.js";
import type { Environment } from "../src/config/environment.js";

const environment = {
  AUTH_MAX_FAILED_ATTEMPTS: 5,
  AUTH_LOCKOUT_DURATION_MS: 60_000,
  AUTH_REFRESH_TOKEN_TTL: "30d",
} as unknown as Environment;

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    userId: "user-1",
    email: "user@e2e.test",
    status: "ACTIVE",
    credentialId: "cred-1",
    passwordHash: "$argon2id$stored",
    failedAttemptCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    familyId: "family-1",
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    ...overrides,
  };
}

const request = {
  ip: "203.0.113.7",
  get: () => "vitest",
} as unknown as Request;

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(code);
  });
}

describe("AuthService", () => {
  let repository: {
    findAccountByEmail: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    registerFailedAttempt: ReturnType<typeof vi.fn>;
    clearFailedAttempts: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    findSessionByRefreshHash: ReturnType<typeof vi.fn>;
    rotateSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeFamily: ReturnType<typeof vi.fn>;
  };
  let passwordHasher: { verify: ReturnType<typeof vi.fn> };
  let accessTokens: { issue: ReturnType<typeof vi.fn> };
  let cookies: {
    readRefreshToken: ReturnType<typeof vi.fn>;
    issueSessionCookies: ReturnType<typeof vi.fn>;
    clearSessionCookies: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: AuthService;
  const response = {} as Response;

  beforeEach(() => {
    repository = {
      findAccountByEmail: vi.fn(),
      findUserById: vi.fn(),
      registerFailedAttempt: vi.fn().mockResolvedValue(undefined),
      clearFailedAttempts: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn().mockResolvedValue(makeSession()),
      findSessionByRefreshHash: vi.fn(),
      rotateSession: vi
        .fn()
        .mockResolvedValue(makeSession({ id: "session-2" })),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
    };
    passwordHasher = { verify: vi.fn() };
    accessTokens = { issue: vi.fn().mockResolvedValue("access.jwt") };
    cookies = {
      readRefreshToken: vi.fn(),
      issueSessionCookies: vi.fn(),
      clearSessionCookies: vi.fn(),
    };
    audit = { record: vi.fn() };
    service = new AuthService(
      environment,
      repository as never,
      passwordHasher as never,
      accessTokens as never,
      cookies as never,
      audit as never,
    );
  });

  describe("login", () => {
    it("returns invalid credentials and runs a dummy verify for an unknown account", async () => {
      repository.findAccountByEmail.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expectCode(
        service.login(request, response, {
          email: "x@e2e.test",
          password: "pw",
        }),
        AUTH_ERROR.invalidCredentials,
      );
      expect(passwordHasher.verify).toHaveBeenCalledOnce();
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("rejects a locked account before checking the password", async () => {
      repository.findAccountByEmail.mockResolvedValue(
        makeAccount({ lockedUntil: new Date(Date.now() + 30_000) }),
      );

      await expectCode(
        service.login(request, response, {
          email: "user@e2e.test",
          password: "pw",
        }),
        AUTH_ERROR.accountLocked,
      );
      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });

    it("increments the counter on a wrong password and locks at the ceiling", async () => {
      repository.findAccountByEmail.mockResolvedValue(
        makeAccount({ failedAttemptCount: 4 }),
      );
      passwordHasher.verify.mockResolvedValue(false);

      await expectCode(
        service.login(request, response, {
          email: "user@e2e.test",
          password: "pw",
        }),
        AUTH_ERROR.invalidCredentials,
      );
      expect(repository.registerFailedAttempt).toHaveBeenCalledWith(
        "cred-1",
        expect.any(Date),
      );
    });

    it("rejects an inactive account after the password verifies", async () => {
      repository.findAccountByEmail.mockResolvedValue(
        makeAccount({ status: "INACTIVE" }),
      );
      passwordHasher.verify.mockResolvedValue(true);

      await expectCode(
        service.login(request, response, {
          email: "user@e2e.test",
          password: "pw",
        }),
        AUTH_ERROR.accountInactive,
      );
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("clears prior failures and issues cookies on success", async () => {
      repository.findAccountByEmail.mockResolvedValue(
        makeAccount({ failedAttemptCount: 2 }),
      );
      passwordHasher.verify.mockResolvedValue(true);

      const view = await service.login(request, response, {
        email: "User@E2E.test",
        password: "pw",
      });

      expect(view).toEqual({
        id: "user-1",
        email: "user@e2e.test",
        status: "ACTIVE",
      });
      expect(repository.clearFailedAttempts).toHaveBeenCalledWith("cred-1");
      expect(repository.createSession).toHaveBeenCalledOnce();
      expect(cookies.issueSessionCookies).toHaveBeenCalledOnce();
    });
  });

  describe("refresh", () => {
    it("rejects when no refresh cookie is present", async () => {
      cookies.readRefreshToken.mockReturnValue(undefined);
      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.invalidSession,
      );
    });

    it("rejects an unknown refresh token", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue(null);
      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.invalidSession,
      );
    });

    it("revokes the family when a rotated token is replayed", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession(),
        rotatedAt: new Date(),
        revokedAt: new Date(),
      });

      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.sessionReuseDetected,
      );
      expect(repository.revokeFamily).toHaveBeenCalledWith(
        "family-1",
        "REUSE_DETECTED",
      );
    });

    it("rejects a revoked (non-rotated) token without touching the family", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession({ revokedAt: new Date() }),
        rotatedAt: null,
      });

      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.invalidSession,
      );
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it("revokes an expired session and rejects", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession({ expiresAt: new Date(Date.now() - 1000) }),
        rotatedAt: null,
      });

      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.invalidSession,
      );
      expect(repository.revokeSession).toHaveBeenCalledWith(
        "session-1",
        "EXPIRED",
      );
    });

    it("revokes the family when the account is no longer active", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession(),
        rotatedAt: null,
      });
      repository.findUserById.mockResolvedValue({
        id: "user-1",
        email: "user@e2e.test",
        status: "INACTIVE",
      });

      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.invalidSession,
      );
      expect(repository.revokeFamily).toHaveBeenCalledWith(
        "family-1",
        "ADMIN_REVOKED",
      );
    });

    it("treats a lost rotation race as reuse", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession(),
        rotatedAt: null,
      });
      repository.findUserById.mockResolvedValue({
        id: "user-1",
        email: "user@e2e.test",
        status: "ACTIVE",
      });
      repository.rotateSession.mockResolvedValue(null);

      await expectCode(
        service.refresh(request, response),
        AUTH_ERROR.sessionReuseDetected,
      );
      expect(repository.revokeFamily).toHaveBeenCalledWith(
        "family-1",
        "REUSE_DETECTED",
      );
    });

    it("rotates and reissues cookies on success", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession(),
        rotatedAt: null,
      });
      repository.findUserById.mockResolvedValue({
        id: "user-1",
        email: "user@e2e.test",
        status: "ACTIVE",
      });

      const view = await service.refresh(request, response);
      expect(view.id).toBe("user-1");
      expect(repository.rotateSession).toHaveBeenCalledOnce();
      expect(cookies.issueSessionCookies).toHaveBeenCalledOnce();
    });
  });

  describe("logout", () => {
    it("clears cookies without a database write when no token is present", async () => {
      cookies.readRefreshToken.mockReturnValue(undefined);
      await service.logout(request, response);
      expect(repository.revokeSession).not.toHaveBeenCalled();
      expect(cookies.clearSessionCookies).toHaveBeenCalledOnce();
    });

    it("revokes the session and clears cookies when a token is present", async () => {
      cookies.readRefreshToken.mockReturnValue("token");
      repository.findSessionByRefreshHash.mockResolvedValue({
        ...makeSession(),
        rotatedAt: null,
      });
      await service.logout(request, response);
      expect(repository.revokeSession).toHaveBeenCalledWith(
        "session-1",
        "LOGOUT",
      );
      expect(cookies.clearSessionCookies).toHaveBeenCalledOnce();
    });
  });

  it("currentUser delegates to the repository", async () => {
    repository.findUserById.mockResolvedValue({
      id: "user-1",
      email: "user@e2e.test",
      status: "ACTIVE",
    });
    await expect(service.currentUser("user-1")).resolves.toEqual({
      id: "user-1",
      email: "user@e2e.test",
      status: "ACTIVE",
    });
  });
});
