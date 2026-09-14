import type {
  AuditActorKind,
  AuditOutcome,
} from "../generated/prisma/client.js";

export type SupportedAuditAction =
  | "authorization.denied"
  | "task.assignee_added"
  | "task.assignee_removed"
  | "task.submitted_for_review"
  | "task.review.approved"
  | "task.review.changes_requested"
  | "managed_file.downloaded";

export interface AppendAuditRecordInput {
  actorKind: AuditActorKind;
  actorUserId?: string;
  requestId?: string;
  correlationId?: string;
  action: SupportedAuditAction;
  resourceType: "task" | "managed_file";
  resourceId: string | null;
  workspaceContext?: string;
  outcome: AuditOutcome;
  metadata?: Record<string, string | number | boolean | null>;
}
