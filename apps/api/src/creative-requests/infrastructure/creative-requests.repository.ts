import { Injectable } from "@nestjs/common";

import {
  CreativeRequestFileKind,
  CreativeRequestStatus,
  Prisma,
  UserAccountStatus,
  type CreativeAssetType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID.test(value);

const PERSON = {
  select: { id: true, email: true, firstName: true, lastName: true },
} as const;

const SELECT = {
  id: true,
  title: true,
  assetType: true,
  requirements: true,
  dueAt: true,
  status: true,
  requestingDepartmentId: true,
  targetDepartmentId: true,
  campaignId: true,
  eventId: true,
  taskId: true,
  requestedById: true,
  declineReason: true,
  respondedAt: true,
  deliveredAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  requestingDepartment: { select: { id: true, name: true } },
  targetDepartment: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
  event: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  requestedBy: PERSON,
} as const;

export type CreativeRequestRecord = Prisma.CreativeRequestGetPayload<{
  select: typeof SELECT;
}>;

const FEEDBACK_SELECT = {
  id: true,
  creativeRequestId: true,
  note: true,
  createdAt: true,
  author: PERSON,
} as const;

export type CreativeRequestFeedbackRecord =
  Prisma.CreativeRequestFeedbackGetPayload<{ select: typeof FEEDBACK_SELECT }>;

/** Which requests a caller may read. Mirrors `PartnerVisibility`. */
export interface CreativeRequestVisibility {
  organization: boolean;
  /** The caller's own department: requests it sent or received. */
  departmentId?: string;
  /** Requesting departments the caller oversees (read-only, EVE-229). */
  overseenDepartmentIds?: string[];
  /** SELF scope: requests the caller sent, or whose task they work on. */
  selfUserId?: string;
  selfTaskIds?: string[];
}

function visibleWhere(
  visibility: CreativeRequestVisibility,
): Prisma.CreativeRequestWhereInput {
  if (visibility.organization) return {};
  const or: Prisma.CreativeRequestWhereInput[] = [];
  if (visibility.departmentId) {
    or.push(
      { requestingDepartmentId: visibility.departmentId },
      { targetDepartmentId: visibility.departmentId },
    );
  }
  if (visibility.overseenDepartmentIds?.length) {
    or.push({
      requestingDepartmentId: { in: visibility.overseenDepartmentIds },
    });
  }
  if (visibility.selfUserId) {
    or.push({ requestedById: visibility.selfUserId });
  }
  if (visibility.selfTaskIds?.length) {
    or.push({ taskId: { in: visibility.selfTaskIds } });
  }
  return or.length > 0 ? { OR: or } : { id: { in: [] } };
}

@Injectable()
export class CreativeRequestsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  /** An active department by its seeded name. */
  async findActiveDepartmentIdByName(name: string): Promise<string | null> {
    const department = await this.db.department.findFirst({
      where: { name, deactivatedAt: null },
      select: { id: true },
    });
    return department?.id ?? null;
  }

  async campaignDepartmentId(
    campaignId: string,
  ): Promise<string | null | undefined> {
    const campaign = await this.db.campaign.findUnique({
      where: { id: campaignId },
      select: { departmentId: true },
    });
    return campaign ? campaign.departmentId : undefined;
  }

  async eventExists(eventId: string): Promise<boolean> {
    return (await this.db.event.count({ where: { id: eventId } })) > 0;
  }

  /** The department's recorded manager, while that account is active. */
  async activeDepartmentManagerId(
    departmentId: string,
  ): Promise<string | null> {
    const department = await this.db.department.findUnique({
      where: { id: departmentId },
      select: { manager: { select: { id: true, status: true } } },
    });
    const manager = department?.manager;
    return manager && manager.status === UserAccountStatus.ACTIVE
      ? manager.id
      : null;
  }

  async findById(id: string): Promise<CreativeRequestRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.creativeRequest.findUnique({
      where: { id },
      select: SELECT,
    });
  }

  async list(input: {
    visibility: CreativeRequestVisibility;
    status?: CreativeRequestStatus;
    sentByDepartmentId?: string;
    receivedByDepartmentId?: string;
    campaignId?: string;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: CreativeRequestRecord[]; total: number }> {
    const where: Prisma.CreativeRequestWhereInput = {
      AND: [
        visibleWhere(input.visibility),
        ...(input.status ? [{ status: input.status }] : []),
        ...(input.sentByDepartmentId
          ? [{ requestingDepartmentId: input.sentByDepartmentId }]
          : []),
        ...(input.receivedByDepartmentId
          ? [{ targetDepartmentId: input.receivedByDepartmentId }]
          : []),
        ...(input.campaignId ? [{ campaignId: input.campaignId }] : []),
        ...(input.search
          ? [
              {
                title: { contains: input.search, mode: "insensitive" as const },
              },
            ]
          : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.db.creativeRequest.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.creativeRequest.count({ where }),
    ]);
    return { items, total };
  }

  async create(
    tx: Prisma.TransactionClient,
    data: {
      title: string;
      assetType: CreativeAssetType;
      requirements: string;
      dueAt: Date | null;
      requestingDepartmentId: string;
      targetDepartmentId: string;
      campaignId: string | null;
      eventId: string | null;
      requestedById: string;
    },
  ): Promise<string> {
    const created = await tx.creativeRequest.create({
      data,
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Moves a request only when it is still in `from`, so two concurrent moves
   * cannot both succeed. Returns false when the status already changed.
   */
  async move(
    tx: Prisma.TransactionClient,
    id: string,
    from: CreativeRequestStatus,
    data: Prisma.CreativeRequestUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const result = await tx.creativeRequest.updateMany({
      where: { id, status: from },
      data,
    });
    return result.count === 1;
  }

  async addFeedback(
    tx: Prisma.TransactionClient | DatabaseService,
    input: { creativeRequestId: string; authorId: string; note: string },
  ): Promise<CreativeRequestFeedbackRecord> {
    return tx.creativeRequestFeedback.create({
      data: input,
      select: FEEDBACK_SELECT,
    });
  }

  async listFeedback(
    creativeRequestId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: CreativeRequestFeedbackRecord[]; total: number }> {
    const where = { creativeRequestId };
    const [items, total] = await Promise.all([
      this.db.creativeRequestFeedback.findMany({
        where,
        select: FEEDBACK_SELECT,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.creativeRequestFeedback.count({ where }),
    ]);
    return { items, total };
  }

  /** Locks the request row for an attachment finalization and returns its
   * current status, so a file cannot land on a request that just closed. */
  async lockForAttachment(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<CreativeRequestStatus | null> {
    if (!isUuid(id)) return null;
    const rows = await tx.$queryRaw<{ status: CreativeRequestStatus }[]>`
      SELECT "status" FROM "creative_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return rows[0]?.status ?? null;
  }

  async createAttachment(
    tx: Prisma.TransactionClient,
    input: {
      creativeRequestId: string;
      managedFileId: string;
      kind: CreativeRequestFileKind;
      attachedById: string;
    },
  ): Promise<void> {
    await tx.creativeRequestAttachment.create({ data: input });
  }

  async listAttachments(
    creativeRequestId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: { managedFileId: string; kind: CreativeRequestFileKind }[];
    total: number;
  }> {
    const where = { creativeRequestId };
    const [items, total] = await Promise.all([
      this.db.creativeRequestAttachment.findMany({
        where,
        select: { managedFileId: true, kind: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.creativeRequestAttachment.count({ where }),
    ]);
    return { items, total };
  }

  async hasAttachment(
    creativeRequestId: string,
    managedFileId: string,
  ): Promise<boolean> {
    if (!isUuid(managedFileId)) return false;
    return (
      (await this.db.creativeRequestAttachment.count({
        where: { creativeRequestId, managedFileId },
      })) > 0
    );
  }
}
