import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";

export type SessionRevocationReason =
  | "LOGOUT"
  | "ROTATED"
  | "REUSE_DETECTED"
  | "EXPIRED"
  | "ADMIN_REVOKED"
  | "PASSWORD_CHANGED";

export interface AccountRecord {
  userId: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  credentialId: string;
  passwordHash: string;
  failedAttemptCount: number;
  lockedUntil: Date | null;
}

export interface UserRecord {
  id: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        status: true,
        credential: {
          select: {
            id: true,
            passwordHash: true,
            failedAttemptCount: true,
            lockedUntil: true,
          },
        },
      },
    });

    if (!user?.credential) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      status: user.status,
      credentialId: user.credential.id,
      passwordHash: user.credential.passwordHash,
      failedAttemptCount: user.credential.failedAttemptCount,
      lockedUntil: user.credential.lockedUntil,
    };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    });
  }

  async registerFailedAttempt(
    credentialId: string,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.db.userCredential.update({
      where: { id: credentialId },
      data: {
        failedAttemptCount: { increment: 1 },
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });
  }

  async clearFailedAttempts(credentialId: string): Promise<void> {
    await this.db.userCredential.update({
      where: { id: credentialId },
      data: { failedAttemptCount: 0, lockedUntil: null },
    });
  }

  async createSession(session: NewSession): Promise<SessionRecord> {
    const created = await this.db.authSession.create({
      data: {
        userId: session.userId,
        familyId: session.familyId,
        refreshTokenHash: session.refreshTokenHash,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return created;
  }

  async findSessionByRefreshHash(
    hash: string,
  ): Promise<(SessionRecord & { rotatedAt: Date | null }) | null> {
    return this.db.authSession.findUnique({
      where: { refreshTokenHash: hash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        rotatedAt: true,
      },
    });
  }

  /**
   * Atomically revoke the presented session and issue its successor. Returns
   * `null` when the session was already rotated or revoked by a concurrent
   * request, so the caller can treat the race as a replay.
   */
  async rotateSession(
    currentSessionId: string,
    successor: NewSession,
  ): Promise<SessionRecord | null> {
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.authSession.updateMany({
        where: { id: currentSessionId, rotatedAt: null, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: "ROTATED",
          rotatedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      const created = await tx.authSession.create({
        data: {
          userId: successor.userId,
          familyId: successor.familyId,
          refreshTokenHash: successor.refreshTokenHash,
          expiresAt: successor.expiresAt,
          ipAddress: successor.ipAddress,
          userAgent: successor.userAgent,
        },
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      await tx.authSession.update({
        where: { id: currentSessionId },
        data: { replacedBySessionId: created.id },
      });

      return created;
    });
  }

  async revokeSession(
    sessionId: string,
    reason: SessionRevocationReason,
  ): Promise<void> {
    await this.db.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(
    familyId: string,
    reason: SessionRevocationReason,
  ): Promise<void> {
    await this.db.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** A session backs an authenticated request only while it and its user are live. */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const active = await this.db.authSession.findFirst({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    return active !== null;
  }
}
