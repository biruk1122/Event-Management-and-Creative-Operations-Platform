import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  HttpException,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { PermissionsService } from "../../common/security/permissions.service.js";
import { permissionDenied } from "../../common/security/security.errors.js";
import { GoogleMeetConfig } from "./google-meet.config.js";
import {
  GoogleCalendarAdapter,
  conferenceLink,
} from "./google-calendar.adapter.js";
import { MeetError } from "./google-meet.errors.js";
import { GoogleMeetRepository } from "./google-meet.repository.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class GoogleMeetService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly repository: GoogleMeetRepository,
    private readonly permissions: PermissionsService,
    private readonly config: GoogleMeetConfig,
    private readonly google: GoogleCalendarAdapter,
  ) {}

  onModuleInit() {
    if (!this.config.env.GOOGLE_MEET_ENABLED) return;
    this.timer = setInterval(() => {
      void this.reconcileDueExports().catch(() => undefined);
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private enabled() {
    if (!this.config.cipher) throw new MeetError("DISABLED");
    return this.config.cipher;
  }
  private async organizer(userId: string) {
    if (!(await this.repository.active(userId))) throw permissionDenied();
    const grants = await this.permissions.getEffectiveGrants(userId);
    const allowed = grants.some(
      (g) =>
        g.permissionKey === "meeting.update" &&
        (g.scope === "ORGANIZATION" || g.scope === "DEPARTMENT"),
    );
    if (!allowed) throw permissionDenied();
    if (
      !grants.some(
        (g) =>
          g.permissionKey === "meeting.update" && g.scope === "ORGANIZATION",
      )
    ) {
      const user = await this.repository.db.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (!user?.departmentId) throw permissionDenied();
    }
  }
  private async meeting(userId: string, id: string) {
    await this.organizer(userId);
    const meeting = await this.repository.db.meeting.findUnique({
      where: { id },
    });
    if (!meeting || meeting.organizerId !== userId) throw permissionDenied();
    return meeting;
  }
  async status(userId: string, meetingId: string) {
    await this.meeting(userId, meetingId);
    const connection =
      await this.repository.db.googleCalendarConnection.findUnique({
        where: { userId },
      });
    const mapping = await this.repository.db.googleMeetExport.findUnique({
      where: { meetingId },
    });
    return {
      enabled: this.config.env.GOOGLE_MEET_ENABLED,
      connection: connection?.status ?? "DISCONNECTED",
      exportState: mapping?.status ?? "NONE",
      failure: mapping?.failure ?? null,
    };
  }
  async authorize(userId: string, sessionId: string): Promise<string> {
    await this.organizer(userId);
    const cipher = this.enabled();
    const lease = await this.repository.lock(userId);
    try {
      const connection =
        await this.repository.db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId },
        });
      if (connection.token) throw new MeetError("BUSY");
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      const data = {
        sessionId,
        stateHash: digest(state),
        verifier: cipher.seal(verifier, `consent:${userId}`),
        expiresAt: new Date(Date.now() + 600_000),
      };
      await this.repository.db.googleCalendarConsent.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await this.repository.db.googleCalendarConsent.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return this.google.authorizationUrl(
        state,
        createHash("sha256").update(verifier).digest("base64url"),
      );
    } finally {
      await this.repository.unlock(userId, lease);
    }
  }
  async callback(
    userId: string,
    sessionId: string,
    state: string,
    code: string | undefined,
  ) {
    const cipher = this.enabled();
    await this.organizer(userId);
    const consent = await this.repository.consumeConsent(
      userId,
      sessionId,
      digest(state),
    );
    if (!code) throw new MeetError("CONSENT_INVALID");
    const lease = await this.repository.lock(userId);
    try {
      const current =
        await this.repository.db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId },
        });
      if (current.token) throw new MeetError("BUSY");
      const grant = await this.google.exchange(
        userId,
        code,
        cipher.open(consent.verifier, `consent:${userId}`),
      );
      const session = await this.repository.db.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: "ACTIVE" },
        },
      });
      if (!session) throw new MeetError("CONSENT_INVALID");
      await this.repository.db.googleCalendarConnection.updateMany({
        where: { userId, leaseId: lease },
        data: {
          token: cipher.seal(grant.refreshToken, `refresh:${userId}`),
          subject: grant.subject,
          generation: randomUUID(),
          status: "CONNECTED",
        },
      });
    } finally {
      await this.repository.unlock(userId, lease);
    }
  }
  async disconnect(userId: string) {
    // Disconnect is available even when the feature is disabled or grants were
    // removed. Only the authenticated owner can erase their connection.
    const lease = await this.repository.lock(userId);
    let remoteRevoked = false;
    try {
      const connection =
        await this.repository.db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId },
        });
      const token = connection.token;
      await this.repository.db.$transaction([
        this.repository.db.googleCalendarConnection.update({
          where: { userId },
          data: {
            token: null,
            subject: null,
            status:
              token || connection.status !== "DISCONNECTED"
                ? "REVOCATION_FAILED"
                : "DISCONNECTED",
            generation: randomUUID(),
          },
        }),
        this.repository.db.googleCalendarConsent.deleteMany({
          where: { userId },
        }),
        this.repository.db.googleMeetExport.updateMany({
          where: { userId, status: { not: "DETACHED" } },
          data: {
            status: "CLEANUP_PENDING",
            failure: "DISCONNECTED",
            nextAttemptAt: null,
          },
        }),
      ]);
      if (token && this.config.cipher) {
        try {
          await this.google.revoke(
            userId,
            this.config.cipher.open(token, `refresh:${userId}`),
          );
          remoteRevoked = true;
        } catch {
          /* Erasure is unconditional; report uncertainty honestly. */
        }
      } else remoteRevoked = !token && connection.status === "DISCONNECTED";
      await this.repository.db.googleCalendarConnection.updateMany({
        where: { userId, leaseId: lease },
        data: { status: remoteRevoked ? "DISCONNECTED" : "REVOCATION_FAILED" },
      });
      return { remoteRevoked };
    } finally {
      await this.repository.unlock(userId, lease);
    }
  }
  /** Re-encryption is owner-triggered, under the same distributed lease used
   * by refresh; the configured previous key remains readable for rollback. */
  async rotate(userId: string) {
    const cipher = this.enabled();
    const lease = await this.repository.lock(userId);
    try {
      const row =
        await this.repository.db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId },
        });
      if (row.token)
        await this.repository.db.googleCalendarConnection.update({
          where: { userId },
          data: {
            token: cipher.seal(
              cipher.open(row.token, `refresh:${userId}`),
              `refresh:${userId}`,
            ),
          },
        });
    } finally {
      await this.repository.unlock(userId, lease);
    }
  }
  async synchronize(
    userId: string,
    meetingId: string,
    cleanup = false,
    background = false,
  ) {
    const meeting = await this.meeting(userId, meetingId);
    const cipher = this.enabled();
    if (
      !cleanup &&
      (meeting.status !== "SCHEDULED" || meeting.type === "PHYSICAL")
    )
      throw new MeetError("INVALID_MEETING");
    const lease = await this.repository.lock(userId);
    try {
      const db = this.repository.db;
      const connection = await db.googleCalendarConnection.findUniqueOrThrow({
        where: { userId },
      });
      if (!connection.token || connection.status !== "CONNECTED")
        throw new MeetError("RECONNECT_REQUIRED");
      let mapping = await db.googleMeetExport.findUnique({
        where: { meetingId },
      });
      if (
        background &&
        (!mapping ||
          !["PENDING", "CLEANUP_PENDING"].includes(mapping.status) ||
          mapping.attempts >= 3 ||
          !mapping.nextAttemptAt ||
          mapping.nextAttemptAt > new Date())
      )
        return;
      if (
        mapping &&
        mapping.status !== "DETACHED" &&
        mapping.generation !== connection.generation
      ) {
        if (!connection.subject || mapping.subject !== connection.subject)
          throw new MeetError("EXPORT_ACCOUNT_CHANGED");
        mapping = await db.googleMeetExport.update({
          where: { meetingId },
          data: { generation: connection.generation },
        });
      }
      if (
        mapping &&
        !background &&
        mapping.attemptedAt &&
        Date.now() - mapping.attemptedAt.getTime() < 10_000
      )
        throw new MeetError("BUSY");
      if (mapping?.status === "CLEANUP_PENDING") cleanup = true;
      if (!mapping && cleanup) return;
      if (!mapping || (!cleanup && mapping.status === "DETACHED")) {
        const data = {
          userId,
          generation: connection.generation,
          subject: connection.subject,
          eventId: `lela${randomUUID().replaceAll("-", "")}`,
          requestId: randomUUID(),
          publishedLink: null,
          fallbackLink: meeting.onlineLink,
          attempts: 0,
          nextAttemptAt: new Date(Date.now() + 125_000),
          status: "PENDING",
          failure: null,
        };
        mapping = await db.googleMeetExport.upsert({
          where: { meetingId },
          create: { meetingId, ...data },
          update: data,
        });
      }
      if (!mapping) return;
      if (!background)
        mapping = await db.googleMeetExport.update({
          where: { meetingId },
          data: { attempts: 0 },
        });
      const staleManual =
        (mapping.publishedLink ?? mapping.fallbackLink) !== meeting.onlineLink;
      cleanup ||=
        staleManual ||
        meeting.status === "CANCELLED" ||
        meeting.type === "PHYSICAL";
      await db.googleMeetExport.update({
        where: { meetingId },
        data: {
          status: cleanup ? "CLEANUP_PENDING" : "PENDING",
          attempts: { increment: 1 },
          attemptedAt: new Date(),
          // A crash after provider acceptance must be reclaimable after the
          // connection lease expires, using the same durable event IDs.
          nextAttemptAt: new Date(Date.now() + 125_000),
        },
      });
      // Refresh once per serialized operation; access tokens never leave memory.
      const tokens = await this.google.refresh(
        userId,
        cipher.open(connection.token, `refresh:${userId}`),
      );
      if (tokens.refresh_token)
        await db.googleCalendarConnection.updateMany({
          where: { userId, leaseId: lease, generation: connection.generation },
          data: {
            token: cipher.seal(tokens.refresh_token, `refresh:${userId}`),
          },
        });
      if (cleanup) {
        await this.google.event(
          userId,
          tokens.access_token!,
          mapping.eventId,
          "DELETE",
        );
        await db.googleMeetExport.update({
          where: { meetingId },
          data: {
            status: "DETACHED",
            publishedLink: null,
            subject: null,
            failure: null,
            nextAttemptAt: null,
          },
        });
        return;
      }
      const payload = {
        summary: "Lela meeting",
        visibility: "private",
        start: { dateTime: meeting.startAt.toISOString() },
        end: { dateTime: meeting.endAt.toISOString() },
        reminders: { useDefault: false },
      };
      let event = await this.google.event(
        userId,
        tokens.access_token!,
        mapping.eventId,
        "GET",
      );
      if (!event.id) {
        event = await this.google.event(
          userId,
          tokens.access_token!,
          mapping.eventId,
          "POST",
          {
            ...payload,
            id: mapping.eventId,
            conferenceData: {
              createRequest: {
                requestId: mapping.requestId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          },
        );
        if (event.duplicate)
          event = await this.google.event(
            userId,
            tokens.access_token!,
            mapping.eventId,
            "GET",
          );
      } else {
        event = await this.google.event(
          userId,
          tokens.access_token!,
          mapping.eventId,
          "PATCH",
          payload,
        );
      }
      const link = conferenceLink(event);
      if (!link) {
        if (
          event.conferenceData?.createRequest?.status?.statusCode === "failure"
        )
          throw new MeetError("PROVIDER_DENIED");
        throw new MeetError("PROVIDER_UNAVAILABLE");
      }
      // CAS prevents a late response from replacing a newer manual link,
      // schedule, cancellation or lost grant. Never hold a meeting TX over I/O.
      await this.organizer(userId);
      await db.$transaction(async (tx) => {
        const valid = await tx.googleCalendarConnection.count({
          where: {
            userId,
            leaseId: lease,
            status: "CONNECTED",
            generation: connection.generation,
          },
        });
        if (!valid) throw new MeetError("STALE");
        const changed = await tx.meeting.updateMany({
          where: {
            id: meetingId,
            organizerId: userId,
            updatedAt: meeting.updatedAt,
            status: "SCHEDULED",
            type: { in: ["ONLINE", "HYBRID"] },
          },
          data: { onlineLink: link },
        });
        if (!changed.count) throw new MeetError("STALE");
        await tx.googleMeetExport.update({
          where: { meetingId },
          data: {
            status: "READY",
            publishedLink: link,
            failure: null,
            nextAttemptAt: null,
          },
        });
      });
    } catch (error) {
      if (error instanceof MeetError && error.reason === "BUSY") throw error;
      if (error instanceof MeetError && error.reason === "RECONNECT_REQUIRED")
        await this.repository.db.googleCalendarConnection.updateMany({
          where: { userId, leaseId: lease },
          data: { status: "RECONNECT_REQUIRED", token: null },
        });
      const row = await this.repository.db.googleMeetExport.findUnique({
        where: { meetingId },
      });
      if (row) {
        cleanup ||= row.status === "CLEANUP_PENDING";
        const reason =
          error instanceof MeetError ? error.reason : "PROVIDER_UNAVAILABLE";
        const retry =
          ["PROVIDER_UNAVAILABLE", "QUOTA", "STALE"].includes(reason) &&
          row.attempts < 3;
        await this.repository.db.googleMeetExport.updateMany({
          where: { meetingId, connection: { leaseId: lease } },
          data: {
            status: cleanup ? "CLEANUP_PENDING" : retry ? "PENDING" : "FAILED",
            failure: reason,
            nextAttemptAt: retry
              ? new Date(
                  Date.now() +
                    30_000 * 2 ** row.attempts +
                    Math.random() * 5000,
                )
              : null,
          },
        });
      }
      throw error instanceof MeetError
        ? error
        : new MeetError("PROVIDER_UNAVAILABLE");
    } finally {
      await this.repository.unlock(userId, lease);
    }
  }
  async reconcileDueExports() {
    if (this.running || !this.config.env.GOOGLE_MEET_ENABLED) return;
    this.running = true;
    try {
      // A crash during the last allowed attempt must settle visibly without
      // authorizing a fourth attempt.
      for (const status of ["PENDING", "CLEANUP_PENDING"]) {
        await this.repository.db.googleMeetExport.updateMany({
          where: {
            status,
            attempts: { gte: 3 },
            nextAttemptAt: { lte: new Date() },
            connection: {
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
            },
          },
          data: {
            status: status === "PENDING" ? "FAILED" : "CLEANUP_PENDING",
            failure: "RETRY_EXHAUSTED",
            nextAttemptAt: null,
          },
        });
      }
      const rows = await this.repository.db.googleMeetExport.findMany({
        where: {
          status: { in: ["PENDING", "CLEANUP_PENDING"] },
          attempts: { lt: 3 },
          nextAttemptAt: { lte: new Date() },
        },
        take: 2,
        orderBy: { nextAttemptAt: "asc" },
      });
      for (const row of rows) {
        try {
          await this.synchronize(
            row.userId,
            row.meetingId,
            row.status === "CLEANUP_PENDING",
            true,
          );
        } catch (error) {
          // Settle terminal preflight failures so they cannot starve the batch.
          if (
            (error instanceof HttpException &&
              !(error instanceof MeetError) &&
              error.getStatus() === 403) ||
            (error instanceof MeetError && error.reason === "INVALID_MEETING")
          ) {
            await this.repository.db.googleMeetExport.updateMany({
              where: {
                meetingId: row.meetingId,
                nextAttemptAt: row.nextAttemptAt,
              },
              data: {
                status: "FAILED",
                failure: "LOCAL_ACCESS_OR_LIFECYCLE",
                nextAttemptAt: null,
              },
            });
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
