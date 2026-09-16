import type { OutboxActorKind, Prisma } from "../generated/prisma/client.js";

/**
 * The durable domain events this API instance can produce (ADR 0001 §1).
 * Each name is versioned independently; a producer bumps `version` when its
 * payload shape changes rather than renaming the event.
 */
export type SupportedOutboxEventName =
  | "task.assigned"
  | "task.reviewed"
  | "discuss.message.created"
  | "task.due"
  | "task.overdue";

export interface OutboxConsumerTarget {
  consumerName: string;
  consumerVersion: number;
}

export interface AppendOutboxEventInput {
  eventId?: string;
  name: SupportedOutboxEventName;
  version: number;
  occurredAt?: Date;
  actorKind: OutboxActorKind;
  actorUserId?: string;
  correlationId?: string;
  resourceType: "task" | "message";
  resourceId: string;
  workspaceContext?: string;
  payload?: Prisma.InputJsonObject;
  /** At least one durable consumer - a best-effort-only event never reaches this table (ADR 0001 §1). */
  consumers: [OutboxConsumerTarget, ...OutboxConsumerTarget[]];
}

/** One claimed, due delivery obligation, joined with its event envelope (ADR 0004 §6). */
export interface ClaimedOutboxDelivery {
  deliveryId: string;
  attempts: number;
  event: {
    id: string;
    name: string;
    version: number;
    occurredAt: Date;
    actorKind: OutboxActorKind;
    actorUserId: string | null;
    correlationId: string | null;
    resourceType: string;
    resourceId: string | null;
    workspaceContext: string | null;
    payload: unknown;
  };
}
