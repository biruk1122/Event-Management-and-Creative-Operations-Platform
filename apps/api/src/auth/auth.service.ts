import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";

import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { AuthAuditService } from "./auth-audit.service.js";
import { AuthCookies, durationToMs } from "./auth-cookies.js";
import {
  accountInactive,
  accountLocked,
  invalidCredentials,
  invalidSession,
  sessionReuseDetected,
} from "./auth.errors.js";
import { AccessTokenService } from "./domain/access-token.service.js";
import { PasswordHasher } from "./domain/password-hasher.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "./domain/refresh-token.js";
import { AuthRepository } from "./infrastructure/auth.repository.js";

export interface AuthenticatedUserView {
  id: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
}

// A well-formed Argon2id hash, used only to equalise response time for unknown
// accounts so login does not leak which email addresses exist.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZWR1bW15c2FsdHZhbHVl$8Q0m0m1a0zvBv3mQ4xq0m0Zq0m0m0m0m0m0m0m0m0m0";

@Injectable()
export class AuthService {
  private readonly maxFailedAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly refreshTtlMs: number;

  constructor(
    @Inject(ENVIRONMENT) environment: Environment,
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly cookies: AuthCookies,
    private readonly audit: AuthAuditService,
  ) {
    this.maxFailedAttempts = environment.AUTH_MAX_FAILED_ATTEMPTS;
    this.lockoutDurationMs = environment.AUTH_LOCKOUT_DURATION_MS;
    this.refreshTtlMs = durationToMs(environment.AUTH_REFRESH_TOKEN_TTL);
  }

  async login(
    request: Request,
    response: Response,
    input: { email: string; password: string },
  ): Promise<AuthenticatedUserView> {
    const email = input.email.trim().toLowerCase();
    const account = await this.repository.findAccountByEmail(email);

    if (!account) {
      await this.passwordHasher.verify(DUMMY_HASH, input.password);
      this.audit.record(request, "auth.login.failed", {
        outcome: "failure",
        reason: "unknown_account",
      });
      throw invalidCredentials();
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      this.audit.record(request, "auth.login.failed", {
        outcome: "failure",
        actorUserId: account.userId,
        reason: "locked",
      });
      throw accountLocked();
    }

    const passwordMatches = await this.passwordHasher.verify(
      account.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      const attempts = account.failedAttemptCount + 1;
      const lockedUntil =
        attempts >= this.maxFailedAttempts
          ? new Date(Date.now() + this.lockoutDurationMs)
          : null;
      await this.repository.registerFailedAttempt(
        account.credentialId,
        lockedUntil,
      );
      this.audit.record(request, "auth.login.failed", {
        outcome: "failure",
        actorUserId: account.userId,
        reason: lockedUntil ? "locked_now" : "bad_password",
      });
      throw invalidCredentials();
    }

    if (account.status !== "ACTIVE") {
      this.audit.record(request, "auth.login.failed", {
        outcome: "failure",
        actorUserId: account.userId,
        reason: "inactive",
      });
      throw accountInactive();
    }

    if (account.failedAttemptCount > 0 || account.lockedUntil) {
      await this.repository.clearFailedAttempts(account.credentialId);
    }

    const refreshToken = generateRefreshToken();
    const session = await this.repository.createSession({
      userId: account.userId,
      familyId: randomUUID(),
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: this.refreshExpiry(),
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null,
    });

    await this.issueCookies(response, {
      sessionId: session.id,
      userId: account.userId,
      refreshToken,
    });
    this.audit.record(request, "auth.login.succeeded", {
      outcome: "success",
      actorUserId: account.userId,
    });

    return { id: account.userId, email: account.email, status: account.status };
  }

  async refresh(
    request: Request,
    response: Response,
  ): Promise<AuthenticatedUserView> {
    const rawToken = this.cookies.readRefreshToken(request);
    if (!rawToken) {
      throw invalidSession();
    }

    const session = await this.repository.findSessionByRefreshHash(
      hashRefreshToken(rawToken),
    );
    if (!session) {
      throw invalidSession();
    }

    // A rotated token that is presented again indicates theft: revoke the family.
    if (session.rotatedAt !== null) {
      await this.repository.revokeFamily(session.familyId, "REUSE_DETECTED");
      this.cookies.clearSessionCookies(response);
      this.audit.record(request, "auth.session.reuse_detected", {
        outcome: "failure",
        actorUserId: session.userId,
      });
      throw sessionReuseDetected();
    }

    if (session.revokedAt !== null) {
      this.cookies.clearSessionCookies(response);
      throw invalidSession();
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.repository.revokeSession(session.id, "EXPIRED");
      this.cookies.clearSessionCookies(response);
      throw invalidSession();
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      await this.repository.revokeFamily(session.familyId, "ADMIN_REVOKED");
      this.cookies.clearSessionCookies(response);
      throw invalidSession();
    }

    const refreshToken = generateRefreshToken();
    const successor = await this.repository.rotateSession(session.id, {
      userId: session.userId,
      familyId: session.familyId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: this.refreshExpiry(),
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null,
    });

    if (!successor) {
      // A concurrent request already rotated this session: treat as a replay.
      await this.repository.revokeFamily(session.familyId, "REUSE_DETECTED");
      this.cookies.clearSessionCookies(response);
      this.audit.record(request, "auth.session.reuse_detected", {
        outcome: "failure",
        actorUserId: session.userId,
      });
      throw sessionReuseDetected();
    }

    await this.issueCookies(response, {
      sessionId: successor.id,
      userId: session.userId,
      refreshToken,
    });
    this.audit.record(request, "auth.session.refreshed", {
      outcome: "success",
      actorUserId: session.userId,
    });

    return user;
  }

  async logout(request: Request, response: Response): Promise<void> {
    const rawToken = this.cookies.readRefreshToken(request);
    if (rawToken) {
      const session = await this.repository.findSessionByRefreshHash(
        hashRefreshToken(rawToken),
      );
      if (session) {
        await this.repository.revokeSession(session.id, "LOGOUT");
        this.audit.record(request, "auth.logout", {
          outcome: "success",
          actorUserId: session.userId,
        });
      }
    }
    this.cookies.clearSessionCookies(response);
  }

  currentUser(userId: string): Promise<AuthenticatedUserView | null> {
    return this.repository.findUserById(userId);
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlMs);
  }

  private async issueCookies(
    response: Response,
    input: { sessionId: string; userId: string; refreshToken: string },
  ): Promise<void> {
    const accessToken = await this.accessTokens.issue({
      sub: input.userId,
      sid: input.sessionId,
    });
    this.cookies.issueSessionCookies(response, {
      accessToken,
      refreshToken: input.refreshToken,
    });
  }
}
