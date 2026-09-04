import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";

import type { RequestWithContext } from "../common/http/request-with-context.js";

export type AuthAuditAction =
  | "auth.login.succeeded"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.session.refreshed"
  | "auth.session.reuse_detected";

interface AuthAuditContext {
  actorUserId?: string;
  outcome: "success" | "failure";
  reason?: string;
}

/**
 * Emits authentication audit events. This is an interim, log-only implementation:
 * REL-02 replaces it with durable audit rows written inside the acting
 * transaction, per docs/decisions/0001.
 */
@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger("AuthAudit");

  record(
    request: Request,
    action: AuthAuditAction,
    context: AuthAuditContext,
  ): void {
    this.logger.log({
      audit: true,
      action,
      outcome: context.outcome,
      actorUserId: context.actorUserId ?? null,
      reason: context.reason ?? null,
      ipAddress: request.ip ?? null,
      userAgent: request.get("user-agent") ?? null,
      requestId: (request as RequestWithContext).id ?? null,
    });
  }
}
