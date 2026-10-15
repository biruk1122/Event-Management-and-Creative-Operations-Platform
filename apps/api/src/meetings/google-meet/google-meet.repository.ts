import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { MeetError } from "./google-meet.errors.js";

@Injectable()
export class GoogleMeetRepository {
  constructor(readonly db: DatabaseService) {}

  async lock(userId: string): Promise<string> {
    await this.db.googleCalendarConnection.upsert({
      where: { userId },
      create: { userId },
      update: { userId },
    });
    const leaseId = randomUUID();
    const result = await this.db.googleCalendarConnection.updateMany({
      where: {
        userId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseId, leaseUntil: new Date(Date.now() + 120_000) },
    });
    if (!result.count) throw new MeetError("BUSY");
    return leaseId;
  }
  async unlock(userId: string, leaseId: string) {
    await this.db.googleCalendarConnection.updateMany({
      where: { userId, leaseId },
      data: { leaseId: null, leaseUntil: null },
    });
  }
  async active(userId: string): Promise<boolean> {
    return Boolean(
      await this.db.user.findFirst({
        where: { id: userId, status: "ACTIVE" },
        select: { id: true },
      }),
    );
  }
  async consumeConsent(userId: string, sessionId: string, stateHash: string) {
    return this.db.$transaction(async (tx) => {
      const state = await tx.googleCalendarConsent.findFirst({
        where: { userId, sessionId, stateHash, expiresAt: { gt: new Date() } },
      });
      if (!state) throw new MeetError("CONSENT_INVALID");
      const consumed = await tx.googleCalendarConsent.deleteMany({
        where: { userId, sessionId, stateHash, expiresAt: { gt: new Date() } },
      });
      if (!consumed.count) throw new MeetError("CONSENT_INVALID");
      return state;
    });
  }
  /** Every HTTP attempt, including OAuth/refresh/revocation, reserves all four
   * durable buckets atomically. Fixed windows are UTC; no in-memory counters. */
  async reserve(
    userId: string,
    caps: readonly [number, number, number, number],
  ) {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const day = Math.floor(now / 86_400_000);
    const buckets = [
      {
        key: `project:minute:${minute}`,
        cap: caps[0],
        expiresAt: new Date((minute + 1) * 60_000),
      },
      {
        key: `project:day:${day}`,
        cap: caps[1],
        expiresAt: new Date((day + 1) * 86_400_000),
      },
      {
        key: `user:${userId}:minute:${minute}`,
        cap: caps[2],
        expiresAt: new Date((minute + 1) * 60_000),
      },
      {
        key: `user:${userId}:day:${day}`,
        cap: caps[3],
        expiresAt: new Date((day + 1) * 86_400_000),
      },
    ].sort((a, b) => a.key.localeCompare(b.key));
    await this.db.$transaction(async (tx) => {
      for (const bucket of buckets) {
        await tx.googleCalendarBudget.upsert({
          where: { key: bucket.key },
          create: { key: bucket.key, expiresAt: bucket.expiresAt },
          update: { used: { increment: 0 } },
        });
        const updated = await tx.googleCalendarBudget.updateMany({
          where: { key: bucket.key, used: { lt: bucket.cap } },
          data: { used: { increment: 1 } },
        });
        if (!updated.count) throw new MeetError("QUOTA");
      }
    });
    // Bounded history: buckets are not a permanent activity log.
    await this.db.googleCalendarBudget.deleteMany({
      where: { expiresAt: { lt: new Date(now - 86_400_000) } },
    });
  }
}
