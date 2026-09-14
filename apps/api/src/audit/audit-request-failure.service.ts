import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import type { RequestWithContext } from "../common/http/request-with-context.js";
import { AuditActorKind, AuditOutcome } from "../generated/prisma/client.js";
import type {
  AppendAuditRecordInput,
  SupportedAuditAction,
} from "./audit.types.js";
import {
  AUDIT_WORKSPACE_CONTEXT_RESOLVER,
  type AuditWorkspaceContextResolver,
} from "./audit-workspace-context.js";
import { AuditWriterService } from "./audit-writer.service.js";

interface AuditableRequest {
  action: Exclude<SupportedAuditAction, "authorization.denied">;
  metadata?: AppendAuditRecordInput["metadata"];
  resourceId: string | null;
  resourceType: AppendAuditRecordInput["resourceType"];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function safeReviewOutcome(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("outcome" in body)) return;
  const outcome = body.outcome;
  return outcome === "APPROVED" || outcome === "CHANGES_REQUESTED"
    ? outcome
    : undefined;
}

function classifyAuditableRequest(
  request: RequestWithContext,
): AuditableRequest | null {
  const path = request.originalUrl.split("?", 1)[0] ?? "";
  const download = path.match(
    /^\/api\/v1\/tasks\/([^/]+)\/files\/([^/]+)\/download\/?$/,
  );
  if (request.method === "GET" && download) {
    const taskId = uuidOrNull(download[1]);
    return {
      action: "managed_file.downloaded",
      metadata: {
        ...(taskId ? { parentId: taskId } : {}),
        parentType: "task",
      },
      resourceId: uuidOrNull(download[2]),
      resourceType: "managed_file",
    };
  }

  const assignment = path.match(
    /^\/api\/v1\/tasks\/([^/]+)\/assignees\/([^/]+)\/?$/,
  );
  if ((request.method === "PUT" || request.method === "DELETE") && assignment) {
    const assigneeUserId = uuidOrNull(assignment[2]);
    return {
      action:
        request.method === "PUT"
          ? "task.assignee_added"
          : "task.assignee_removed",
      metadata: assigneeUserId ? { assigneeUserId } : undefined,
      resourceId: uuidOrNull(assignment[1]),
      resourceType: "task",
    };
  }

  const submission = path.match(/^\/api\/v1\/tasks\/([^/]+)\/submit\/?$/);
  if (request.method === "POST" && submission) {
    return {
      action: "task.submitted_for_review",
      resourceId: uuidOrNull(submission[1]),
      resourceType: "task",
    };
  }

  const review = path.match(/^\/api\/v1\/tasks\/([^/]+)\/reviews\/?$/);
  const reviewOutcome = safeReviewOutcome(request.body);
  if (request.method === "POST" && review && reviewOutcome) {
    return {
      action:
        reviewOutcome === "APPROVED"
          ? "task.review.approved"
          : "task.review.changes_requested",
      metadata: { reviewOutcome },
      resourceId: uuidOrNull(review[1]),
      resourceType: "task",
    };
  }

  return null;
}

function taskResourceId(path: string): string | null {
  return uuidOrNull(path.match(/^\/api\/v1\/tasks\/([^/]+)/)?.[1]);
}

@Injectable()
export class AuditRequestFailureService {
  private readonly logger = new Logger(AuditRequestFailureService.name);

  constructor(
    private readonly audit: AuditWriterService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async resolveWorkspaceContext(
    request: AuditableRequest | null,
    fallbackTaskId: string | null,
  ): Promise<string | null> {
    const parentId = request?.metadata?.parentId;
    const taskId =
      request?.resourceType === "task"
        ? request.resourceId
        : typeof parentId === "string"
          ? uuidOrNull(parentId)
          : fallbackTaskId;
    if (!taskId) return null;

    const resolver = this.moduleRef.get<AuditWorkspaceContextResolver>(
      AUDIT_WORKSPACE_CONTEXT_RESOLVER,
      { strict: false },
    );
    return resolver.resolveTaskWorkspaceContext(taskId);
  }

  async recordFailure(
    request: RequestWithContext,
    status: number,
    errorCode: string,
  ): Promise<void> {
    const path = request.originalUrl.split("?", 1)[0] ?? "";
    const auditableRequest = classifyAuditableRequest(request);
    const isAuthorizationDenial =
      path.startsWith("/api/v1/tasks") && (status === 401 || status === 403);

    if (!auditableRequest && !isAuthorizationDenial) return;

    const userId = uuidOrNull(request.user?.userId);
    let input: AppendAuditRecordInput;
    if (isAuthorizationDenial) {
      input = {
        action: "authorization.denied",
        actorKind: userId ? AuditActorKind.USER : AuditActorKind.ANONYMOUS,
        ...(userId ? { actorUserId: userId } : {}),
        metadata: {
          errorCode,
          ...(auditableRequest
            ? { attemptedAction: auditableRequest.action }
            : {}),
        },
        outcome: AuditOutcome.DENIED,
        requestId: request.id ?? "unavailable",
        resourceId:
          auditableRequest?.resourceId ?? taskResourceId(path) ?? null,
        resourceType: auditableRequest?.resourceType ?? "task",
      };
    } else {
      if (!auditableRequest) return;
      input = {
        action: auditableRequest.action,
        actorKind: userId ? AuditActorKind.USER : AuditActorKind.ANONYMOUS,
        ...(userId ? { actorUserId: userId } : {}),
        metadata: {
          errorCode,
          ...auditableRequest.metadata,
        },
        outcome: status === 404 ? AuditOutcome.DENIED : AuditOutcome.FAILED,
        requestId: request.id ?? "unavailable",
        resourceId: auditableRequest.resourceId,
        resourceType: auditableRequest.resourceType,
      };
    }

    try {
      const workspaceContext = await this.resolveWorkspaceContext(
        auditableRequest,
        taskResourceId(path),
      );
      await this.audit.record({
        ...input,
        ...(workspaceContext ? { workspaceContext } : {}),
      });
    } catch (auditError) {
      this.logger.error(
        {
          action: input.action,
          auditError:
            auditError instanceof Error ? auditError.name : "UnknownError",
          method: request.method,
          requestId: input.requestId,
        },
        "CRITICAL: failed to persist a denied or failed request audit record",
      );
    }
  }
}
