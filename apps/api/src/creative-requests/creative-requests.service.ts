import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../audit/audit-writer.service.js";
import {
  PRODUCTION_DEPARTMENT,
  PROMOTION_DEPARTMENT,
} from "../common/security/department-access.policy.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { DatabaseService } from "../database/database.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  CreativeRequestFileKind,
  CreativeRequestStatus,
  OutboxActorKind,
  type Prisma,
} from "../generated/prisma/client.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { SupportedOutboxEventName } from "../outbox/outbox.types.js";
import { TasksService } from "../tasks/tasks.service.js";
import type {
  CreativeRequestFeedbackResponse,
  CreativeRequestResponse,
  PaginatedCreativeRequestFeedbackResponse,
  PaginatedCreativeRequestsResponse,
} from "./creative-requests.contracts.js";
import type {
  CreateCreativeRequestDto,
  CreateCreativeRequestFeedbackDto,
  DeclineCreativeRequestDto,
  ListCreativeRequestFeedbackQueryDto,
  ListCreativeRequestsQueryDto,
  ReviewCreativeRequestDto,
} from "./creative-requests.dto.js";
import {
  creativeRequestCampaignNotFound,
  creativeRequestConcurrentChange,
  creativeRequestDepartmentUnavailable,
  creativeRequestEventNotFound,
  creativeRequestFileNotAllowed,
  creativeRequestInvalidTransition,
  creativeRequestNotFound,
  creativeRequestNoteRequired,
} from "./creative-requests.errors.js";
import {
  canAttachCreativeRequestFile,
  creativeRequestMove,
  creativeRequestMovesFrom,
  sideForFileKind,
  type CreativeRequestSide,
} from "./creative-requests.lifecycle.js";
import {
  CreativeRequestsRepository,
  type CreativeRequestFeedbackRecord,
  type CreativeRequestRecord,
  type CreativeRequestVisibility,
} from "./infrastructure/creative-requests.repository.js";

type ActionKey =
  | "creative_request.create"
  | "creative_request.respond"
  | "creative_request.review";

/** Everything the authorization checks need about one caller, resolved once
 * per call so a list does not repeat permission lookups per row. */
interface Actor {
  userId: string;
  departmentId: string | null;
  organization: ReadonlySet<string>;
  department: ReadonlySet<string>;
  readSelf: boolean;
  overseenDepartmentIds: readonly string[];
  /** Lazily resolved: the CREATIVE tasks the caller is assigned to. */
  assignedTaskIds: () => Promise<readonly string[]>;
}

const KEYS = [
  "creative_request.create",
  "creative_request.read",
  "creative_request.respond",
  "creative_request.review",
] as const;

const EVENT_FOR_STATUS: Partial<
  Record<CreativeRequestStatus, SupportedOutboxEventName>
> = {
  [CreativeRequestStatus.ACCEPTED]: "creative_request.accepted",
  [CreativeRequestStatus.DECLINED]: "creative_request.declined",
  [CreativeRequestStatus.DELIVERED]: "creative_request.delivered",
  [CreativeRequestStatus.APPROVED]: "creative_request.reviewed",
  [CreativeRequestStatus.CHANGES_REQUESTED]: "creative_request.reviewed",
};

/**
 * Creative requests (EVE-232): the Promotion department asks the Production
 * department for creative work and reviews what comes back.
 *
 * The permission keys are held by every Department Manager; this service is
 * the boundary that limits each one to its side of a request:
 * - `create` and `review` act for the requesting department;
 * - `respond` acts for the target department;
 * - `read` covers either department, the overseeing manager of the
 *   requesting department (read-only), and, at SELF scope, the requester and
 *   the people assigned to the request's task.
 * Super Admin holds every key at ORGANIZATION scope.
 */
@Injectable()
export class CreativeRequestsService {
  constructor(
    private readonly repository: CreativeRequestsRepository,
    private readonly permissions: PermissionsService,
    private readonly tasks: TasksService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly audit: AuditWriterService,
  ) {}

  private async actor(userId: string): Promise<Actor> {
    const checks = await Promise.all(
      KEYS.flatMap((key) => [
        this.permissions.hasGrant(userId, key, "ORGANIZATION"),
        this.permissions.hasGrant(userId, key, "DEPARTMENT"),
      ]),
    );
    const organization = new Set<string>();
    const department = new Set<string>();
    KEYS.forEach((key, index) => {
      if (checks[index * 2]) organization.add(key);
      if (checks[index * 2 + 1]) department.add(key);
    });
    const [departmentId, readSelf, overseenDepartmentIds] = await Promise.all([
      department.size > 0
        ? this.repository.findUserDepartmentId(userId)
        : Promise.resolve(null),
      this.permissions.hasGrant(userId, "creative_request.read", "SELF"),
      organization.has("creative_request.read")
        ? Promise.resolve([] as string[])
        : this.permissions.overseenDepartmentIdsFor(
            userId,
            "creative_request.read",
          ),
    ]);
    let assigned: Promise<readonly string[]> | null = null;
    return {
      userId,
      departmentId,
      organization,
      department,
      readSelf,
      overseenDepartmentIds,
      assignedTaskIds: () =>
        (assigned ??= readSelf
          ? this.tasks.listAssignedCreativeTaskIds(userId)
          : Promise.resolve([])),
    };
  }

  private canRead(actor: Actor): boolean {
    return (
      actor.organization.has("creative_request.read") ||
      actor.department.has("creative_request.read") ||
      actor.readSelf ||
      actor.overseenDepartmentIds.length > 0
    );
  }

  /** Whether the caller may act with `key` on `side` of this request. */
  private actsFor(
    actor: Actor,
    key: ActionKey,
    side: CreativeRequestSide,
    request: Pick<
      CreativeRequestRecord,
      "requestingDepartmentId" | "targetDepartmentId"
    >,
  ): boolean {
    if (actor.organization.has(key)) return true;
    if (!actor.department.has(key) || !actor.departmentId) return false;
    return side === "REQUESTER"
      ? actor.departmentId === request.requestingDepartmentId
      : actor.departmentId === request.targetDepartmentId;
  }

  private async mayRead(
    actor: Actor,
    request: CreativeRequestRecord,
  ): Promise<boolean> {
    if (actor.organization.has("creative_request.read")) return true;
    if (
      actor.department.has("creative_request.read") &&
      actor.departmentId &&
      (actor.departmentId === request.requestingDepartmentId ||
        actor.departmentId === request.targetDepartmentId)
    )
      return true;
    if (actor.overseenDepartmentIds.includes(request.requestingDepartmentId))
      return true;
    if (actor.readSelf) {
      if (request.requestedById === actor.userId) return true;
      if (
        request.taskId &&
        (await actor.assignedTaskIds()).includes(request.taskId)
      )
        return true;
    }
    return false;
  }

  /** Loads a request the caller may read. Never reveals a request outside
   * the caller's scope: only an organization reader learns it is missing. */
  private async load(actor: Actor, id: string): Promise<CreativeRequestRecord> {
    const request = await this.repository.findById(id);
    if (!request) {
      if (actor.organization.has("creative_request.read"))
        throw creativeRequestNotFound();
      throw permissionDenied();
    }
    if (!(await this.mayRead(actor, request))) throw permissionDenied();
    return request;
  }

  private canAddFeedback(actor: Actor, request: CreativeRequestRecord) {
    return (
      this.actsFor(actor, "creative_request.create", "REQUESTER", request) ||
      this.actsFor(actor, "creative_request.review", "REQUESTER", request) ||
      this.actsFor(actor, "creative_request.respond", "RESPONDER", request)
    );
  }

  private canAttachKind(
    actor: Actor,
    request: CreativeRequestRecord,
    kind: CreativeRequestFileKind,
  ): boolean {
    const side = sideForFileKind(kind);
    const key: ActionKey =
      side === "REQUESTER"
        ? "creative_request.create"
        : "creative_request.respond";
    return (
      this.actsFor(actor, key, side, request) &&
      canAttachCreativeRequestFile(request.status, kind)
    );
  }

  private toResponse(
    actor: Actor,
    request: CreativeRequestRecord,
  ): CreativeRequestResponse {
    const moves = creativeRequestMovesFrom(request.status)
      .filter((move) =>
        this.actsFor(actor, move.permissionKey, move.side, request),
      )
      .map((move) => move.to);
    const canAddFeedback = this.canAddFeedback(actor, request);
    const canAttach = Object.values(CreativeRequestFileKind).filter((kind) =>
      this.canAttachKind(actor, request, kind),
    );
    const actsOnEitherSide =
      canAddFeedback ||
      this.actsFor(actor, "creative_request.respond", "RESPONDER", request);
    return {
      id: request.id,
      title: request.title,
      assetType: request.assetType,
      requirements: request.requirements,
      dueAt: request.dueAt?.toISOString() ?? null,
      status: request.status,
      requestingDepartment: request.requestingDepartment,
      targetDepartment: request.targetDepartment,
      campaign: request.campaign,
      event: request.event,
      task: request.task,
      requestedBy: request.requestedBy,
      declineReason: request.declineReason,
      respondedAt: request.respondedAt?.toISOString() ?? null,
      deliveredAt: request.deliveredAt?.toISOString() ?? null,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      abilities: {
        moves,
        canAddFeedback,
        canAttach,
        readOnly: !actsOnEitherSide,
      },
    };
  }

  async list(
    userId: string,
    query: ListCreativeRequestsQueryDto,
  ): Promise<PaginatedCreativeRequestsResponse> {
    const actor = await this.actor(userId);
    if (!this.canRead(actor)) throw permissionDenied();
    const visibility: CreativeRequestVisibility = {
      organization: actor.organization.has("creative_request.read"),
      ...(actor.department.has("creative_request.read") && actor.departmentId
        ? { departmentId: actor.departmentId }
        : {}),
      ...(actor.overseenDepartmentIds.length > 0
        ? { overseenDepartmentIds: [...actor.overseenDepartmentIds] }
        : {}),
      ...(actor.readSelf
        ? {
            selfUserId: userId,
            selfTaskIds: [...(await actor.assignedTaskIds())],
          }
        : {}),
    };
    // SENT / RECEIVED are relative to the caller's own department; Super
    // Admin, who has none, reads them as Promotion's and Production's.
    const ownOrNamed = async (name: string) =>
      actor.departmentId ??
      (await this.repository.findActiveDepartmentIdByName(name)) ??
      undefined;
    const sentBy =
      query.direction === "SENT"
        ? await ownOrNamed(PROMOTION_DEPARTMENT)
        : undefined;
    const receivedBy =
      query.direction === "RECEIVED"
        ? await ownOrNamed(PRODUCTION_DEPARTMENT)
        : undefined;
    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(sentBy ? { sentByDepartmentId: sentBy } : {}),
      ...(receivedBy ? { receivedByDepartmentId: receivedBy } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map((item) => this.toResponse(actor, item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(userId: string, id: string): Promise<CreativeRequestResponse> {
    const actor = await this.actor(userId);
    return this.toResponse(actor, await this.load(actor, id));
  }

  /** Sends a request from Promotion to Production. A department-scoped caller
   * must belong to Promotion; Super Admin sends it on Promotion's behalf. */
  async create(
    userId: string,
    dto: CreateCreativeRequestDto,
    requestId: string,
  ): Promise<CreativeRequestResponse> {
    const actor = await this.actor(userId);
    const organization = actor.organization.has("creative_request.create");
    if (!organization && !actor.department.has("creative_request.create"))
      throw permissionDenied();
    const [requestingDepartmentId, targetDepartmentId] = await Promise.all([
      this.repository.findActiveDepartmentIdByName(PROMOTION_DEPARTMENT),
      this.repository.findActiveDepartmentIdByName(PRODUCTION_DEPARTMENT),
    ]);
    if (!requestingDepartmentId || !targetDepartmentId)
      throw creativeRequestDepartmentUnavailable();
    if (!organization && actor.departmentId !== requestingDepartmentId)
      throw permissionDenied();
    if (dto.campaignId) {
      const campaignDepartmentId = await this.repository.campaignDepartmentId(
        dto.campaignId,
      );
      if (campaignDepartmentId !== requestingDepartmentId)
        throw creativeRequestCampaignNotFound();
    }
    if (dto.eventId && !(await this.repository.eventExists(dto.eventId)))
      throw creativeRequestEventNotFound();

    const id = await this.db.$transaction(async (tx) => {
      const created = await this.repository.create(tx, {
        title: dto.title.trim(),
        assetType: dto.assetType,
        requirements: dto.requirements.trim(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        requestingDepartmentId,
        targetDepartmentId,
        campaignId: dto.campaignId ?? null,
        eventId: dto.eventId ?? null,
        requestedById: userId,
      });
      await this.audit.append(tx, {
        action: "creative_request.created",
        actorKind: AuditActorKind.USER,
        actorUserId: userId,
        requestId,
        resourceType: "creative_request",
        resourceId: created,
        outcome: AuditOutcome.SUCCEEDED,
        metadata: { assetType: dto.assetType },
      });
      await this.event(
        tx,
        "creative_request.submitted",
        userId,
        created,
        requestId,
      );
      return created;
    });
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string, requestId: string) {
    return this.moveTo(userId, id, CreativeRequestStatus.CANCELLED, requestId);
  }

  async start(userId: string, id: string, requestId: string) {
    return this.moveTo(
      userId,
      id,
      CreativeRequestStatus.IN_PROGRESS,
      requestId,
    );
  }

  async deliver(userId: string, id: string, requestId: string) {
    return this.moveTo(userId, id, CreativeRequestStatus.DELIVERED, requestId);
  }

  async decline(
    userId: string,
    id: string,
    dto: DeclineCreativeRequestDto,
    requestId: string,
  ) {
    return this.moveTo(userId, id, CreativeRequestStatus.DECLINED, requestId, {
      declineReason: dto.reason.trim(),
    });
  }

  async review(
    userId: string,
    id: string,
    dto: ReviewCreativeRequestDto,
    requestId: string,
  ) {
    const note = dto.note?.trim();
    if (dto.outcome === "CHANGES_REQUESTED" && !note)
      throw creativeRequestNoteRequired();
    return this.moveTo(
      userId,
      id,
      dto.outcome === "APPROVED"
        ? CreativeRequestStatus.APPROVED
        : CreativeRequestStatus.CHANGES_REQUESTED,
      requestId,
      {},
      note || undefined,
    );
  }

  /**
   * Accepts a request: in one transaction the request moves from SUBMITTED to
   * ACCEPTED, a CREATIVE task is created in the target department, and the
   * two are linked. A concurrent accept or decline makes exactly one of them
   * succeed; the other is refused and writes nothing.
   */
  async accept(
    userId: string,
    id: string,
    requestId: string,
  ): Promise<CreativeRequestResponse> {
    const actor = await this.actor(userId);
    const request = await this.load(actor, id);
    this.assertMove(actor, request, CreativeRequestStatus.ACCEPTED);
    const createTask = await this.tasks.prepareCreativeTask(userId, {
      departmentId: request.targetDepartmentId,
      title: request.title,
      description: `Creative request from ${request.requestingDepartment.name}.\n\n${request.requirements}`,
      dueAt: request.dueAt,
      relatedCampaignId: request.campaignId,
      relatedEventId: request.eventId,
    });
    await this.db.$transaction(async (tx) => {
      const now = new Date();
      const moved = await this.repository.move(
        tx,
        id,
        CreativeRequestStatus.SUBMITTED,
        { status: CreativeRequestStatus.ACCEPTED, respondedAt: now },
      );
      if (!moved) throw creativeRequestConcurrentChange();
      const taskId = await createTask(tx);
      await this.repository.move(tx, id, CreativeRequestStatus.ACCEPTED, {
        taskId,
      });
      await this.recordMove(
        tx,
        userId,
        id,
        request.status,
        CreativeRequestStatus.ACCEPTED,
        requestId,
      );
    });
    return this.get(userId, id);
  }

  private assertMove(
    actor: Actor,
    request: CreativeRequestRecord,
    to: CreativeRequestStatus,
  ): void {
    const move = creativeRequestMove(request.status, to);
    if (!move) {
      // Only reveal the lifecycle rule to someone who could act on this
      // request at all; anyone else is simply refused.
      if (!this.canAddFeedback(actor, request)) throw permissionDenied();
      throw creativeRequestInvalidTransition(request.status, to);
    }
    if (!this.actsFor(actor, move.permissionKey, move.side, request))
      throw permissionDenied();
  }

  private async moveTo(
    userId: string,
    id: string,
    to: CreativeRequestStatus,
    requestId: string,
    extra: Prisma.CreativeRequestUncheckedUpdateManyInput = {},
    note?: string,
  ): Promise<CreativeRequestResponse> {
    const actor = await this.actor(userId);
    const request = await this.load(actor, id);
    this.assertMove(actor, request, to);
    const now = new Date();
    const stamps: Prisma.CreativeRequestUncheckedUpdateManyInput =
      to === CreativeRequestStatus.DECLINED
        ? { respondedAt: now }
        : to === CreativeRequestStatus.DELIVERED
          ? { deliveredAt: now }
          : to === CreativeRequestStatus.APPROVED ||
              to === CreativeRequestStatus.CHANGES_REQUESTED
            ? { reviewedAt: now }
            : {};
    await this.db.$transaction(async (tx) => {
      const moved = await this.repository.move(tx, id, request.status, {
        status: to,
        ...stamps,
        ...extra,
      });
      if (!moved) throw creativeRequestConcurrentChange();
      if (note) {
        await this.repository.addFeedback(tx, {
          creativeRequestId: id,
          authorId: userId,
          note,
        });
      }
      await this.recordMove(tx, userId, id, request.status, to, requestId);
    });
    return this.get(userId, id);
  }

  private async recordMove(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    from: CreativeRequestStatus,
    to: CreativeRequestStatus,
    requestId: string,
  ): Promise<void> {
    await this.audit.append(tx, {
      action: "creative_request.status_changed",
      actorKind: AuditActorKind.USER,
      actorUserId: userId,
      requestId,
      resourceType: "creative_request",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { from, to },
    });
    const name = EVENT_FOR_STATUS[to];
    if (name) {
      await this.event(
        tx,
        name,
        userId,
        id,
        requestId,
        name === "creative_request.reviewed" ? { outcome: to } : undefined,
      );
    }
  }

  private event(
    tx: Prisma.TransactionClient,
    name: SupportedOutboxEventName,
    userId: string,
    id: string,
    requestId: string,
    payload?: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.outbox.append(tx, {
      name,
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: userId,
      correlationId: requestId,
      resourceType: "creative_request",
      resourceId: id,
      ...(payload ? { payload } : {}),
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
  }

  async listFeedback(
    userId: string,
    id: string,
    query: ListCreativeRequestFeedbackQueryDto,
  ): Promise<PaginatedCreativeRequestFeedbackResponse> {
    const actor = await this.actor(userId);
    await this.load(actor, id);
    const { items, total } = await this.repository.listFeedback(
      id,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toFeedbackResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Either side of the request may add feedback; oversight may not. */
  async addFeedback(
    userId: string,
    id: string,
    dto: CreateCreativeRequestFeedbackDto,
  ): Promise<CreativeRequestFeedbackResponse> {
    const actor = await this.actor(userId);
    const request = await this.load(actor, id);
    if (!this.canAddFeedback(actor, request)) throw permissionDenied();
    return toFeedbackResponse(
      await this.repository.addFeedback(this.db, {
        creativeRequestId: id,
        authorId: userId,
        note: dto.note.trim(),
      }),
    );
  }

  // File pipeline hooks (used by FileManagementService), mirroring
  // ReportsService's attachment methods.

  /** Checks the caller may add a file of `kind` to this request now. */
  async authorizeAttachment(
    userId: string,
    id: string,
    kind: CreativeRequestFileKind,
  ): Promise<void> {
    const actor = await this.actor(userId);
    const request = await this.load(actor, id);
    if (!this.actsFor(actor, sideKey(kind), sideForFileKind(kind), request))
      throw permissionDenied();
    if (!canAttachCreativeRequestFile(request.status, kind))
      throw creativeRequestFileNotAllowed();
  }

  /** Rechecks, with the request row locked, that the file may still land. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { userId: string; id: string; kind: CreativeRequestFileKind },
  ): Promise<void> {
    await this.authorizeAttachment(input.userId, input.id, input.kind);
    const status = await this.repository.lockForAttachment(tx, input.id);
    if (!status) throw creativeRequestNotFound();
    if (!canAttachCreativeRequestFile(status, input.kind))
      throw creativeRequestFileNotAllowed();
  }

  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      id: string;
      fileId: string;
      kind: CreativeRequestFileKind;
    },
  ): Promise<void> {
    await this.repository.createAttachment(tx, {
      creativeRequestId: input.id,
      managedFileId: input.fileId,
      kind: input.kind,
      attachedById: input.userId,
    });
  }

  async listAttachments(
    userId: string,
    id: string,
    page: number,
    pageSize: number,
  ) {
    const actor = await this.actor(userId);
    await this.load(actor, id);
    return this.repository.listAttachments(id, page, pageSize);
  }

  async hasReadableAttachment(
    userId: string,
    id: string,
    fileId: string,
  ): Promise<boolean> {
    const actor = await this.actor(userId);
    await this.load(actor, id);
    return this.repository.hasAttachment(id, fileId);
  }
}

function sideKey(kind: CreativeRequestFileKind): ActionKey {
  return kind === CreativeRequestFileKind.REFERENCE
    ? "creative_request.create"
    : "creative_request.respond";
}

function toFeedbackResponse(
  record: CreativeRequestFeedbackRecord,
): CreativeRequestFeedbackResponse {
  return {
    id: record.id,
    creativeRequestId: record.creativeRequestId,
    author: record.author,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}
