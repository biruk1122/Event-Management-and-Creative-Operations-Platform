import { Injectable } from "@nestjs/common";

import { Prisma, UserAccountStatus } from "../../generated/prisma/client.js";
import type {
  PartnershipType,
  PartnerStatus,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path segment arrives as a raw string; a non-UUID value cannot match any
 * row, and handing it to a `@db.Uuid` column would raise `22P02` (a 500). */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface PartnerPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A sponsor/media/partnership relationship under development (Marketing
 * Department Workspace). Distinct from `Supplier`: a Partner is a commercial
 * opportunity being built, not a billed vendor. `departmentId = null` only
 * ever occurs for an organization-scoped (Super Admin) creation.
 */
export interface PartnerRecord {
  id: string;
  organizationName: string;
  category: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  departmentId: string | null;
  campaignId: string | null;
  eventId: string | null;
  status: PartnerStatus;
  proposedContribution: string | null;
  notes: string | null;
  followUpAt: Date | null;
  partnershipName: string | null;
  partnershipType: PartnershipType | null;
  agreementDetails: string | null;
  agreementStartOn: Date | null;
  agreementEndOn: Date | null;
  agreedValueAmount: Prisma.Decimal | null;
  agreedValueCurrency: string | null;
  owner: PartnerPersonRecord | null;
  createdBy: PartnerPersonRecord | null;
  updatedBy: PartnerPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerActivityRecord {
  id: string;
  partnerId: string;
  author: PartnerPersonRecord | null;
  note: string;
  createdAt: Date;
}

/** Every partner is visible to an organization-scoped caller; a
 * department-scoped caller (the Manager) sees their own department's
 * partners; a self-scoped caller (a Team Member) sees only the
 * relationships they are the assigned owner of. */
export interface PartnerVisibility {
  organization: boolean;
  departmentId?: string;
  /** Departments the caller oversees read-only (EVE-229). */
  overseenDepartmentIds?: string[];
  selfUserId?: string;
}

export interface ListPartnersInput {
  visibility: PartnerVisibility;
  status?: PartnerStatus;
  departmentId?: string;
  campaignId?: string;
  eventId?: string;
  ownerId?: string;
  partnershipType?: PartnershipType;
  search?: string;
  page: number;
  pageSize: number;
}

export interface CreatePartnerInput {
  organizationName: string;
  category: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  departmentId?: string;
  campaignId?: string;
  eventId?: string;
  status?: PartnerStatus;
  proposedContribution?: string;
  notes?: string;
  followUpAt?: Date;
  ownerId?: string;
  partnershipName?: string;
  partnershipType?: PartnershipType;
  agreementDetails?: string;
  agreementStartOn?: Date;
  agreementEndOn?: Date;
  agreedValueAmount?: string;
  agreedValueCurrency?: string;
  createdById: string;
}

export interface UpdatePartnerFields {
  organizationName?: string;
  category?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  campaignId?: string | null;
  eventId?: string | null;
  status?: PartnerStatus;
  proposedContribution?: string | null;
  notes?: string | null;
  followUpAt?: Date | null;
  ownerId?: string | null;
  partnershipName?: string | null;
  partnershipType?: PartnershipType | null;
  agreementDetails?: string | null;
  agreementStartOn?: Date | null;
  agreementEndOn?: Date | null;
  agreedValueAmount?: string | null;
  agreedValueCurrency?: string | null;
  updatedById: string;
}

export interface ListPartnerActivitiesInput {
  page: number;
  pageSize: number;
}

export interface CreatePartnerActivityInput {
  authorId: string;
  note: string;
}

const PRISMA_ERROR = {
  foreignKeyViolation: "P2003",
  recordNotFound: "P2025",
} as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const PARTNER_SELECT = {
  id: true,
  organizationName: true,
  category: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  departmentId: true,
  campaignId: true,
  eventId: true,
  status: true,
  proposedContribution: true,
  notes: true,
  followUpAt: true,
  partnershipName: true,
  partnershipType: true,
  agreementDetails: true,
  agreementStartOn: true,
  agreementEndOn: true,
  agreedValueAmount: true,
  agreedValueCurrency: true,
  owner: { select: PERSON_SELECT },
  createdBy: { select: PERSON_SELECT },
  updatedBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

type RawPartner = Prisma.PartnerGetPayload<{ select: typeof PARTNER_SELECT }>;

const ACTIVITY_SELECT = {
  id: true,
  partnerId: true,
  author: { select: PERSON_SELECT },
  note: true,
  createdAt: true,
} as const;

function visibleWhere(visibility: PartnerVisibility): Prisma.PartnerWhereInput {
  if (visibility.organization) return {};
  const or: Prisma.PartnerWhereInput[] = [];
  if (visibility.departmentId)
    or.push({ departmentId: visibility.departmentId });
  if (visibility.overseenDepartmentIds?.length)
    or.push({ departmentId: { in: visibility.overseenDepartmentIds } });
  if (visibility.selfUserId) or.push({ ownerId: visibility.selfUserId });
  return or.length > 0 ? { OR: or } : { id: { in: [] } };
}

function toRecord(raw: RawPartner): PartnerRecord {
  return {
    id: raw.id,
    organizationName: raw.organizationName,
    category: raw.category,
    contactName: raw.contactName,
    contactEmail: raw.contactEmail,
    contactPhone: raw.contactPhone,
    departmentId: raw.departmentId,
    campaignId: raw.campaignId,
    eventId: raw.eventId,
    status: raw.status,
    proposedContribution: raw.proposedContribution,
    notes: raw.notes,
    followUpAt: raw.followUpAt,
    partnershipName: raw.partnershipName,
    partnershipType: raw.partnershipType,
    agreementDetails: raw.agreementDetails,
    agreementStartOn: raw.agreementStartOn,
    agreementEndOn: raw.agreementEndOn,
    agreedValueAmount: raw.agreedValueAmount,
    agreedValueCurrency: raw.agreedValueCurrency,
    owner: raw.owner ?? null,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function updateData(fields: UpdatePartnerFields): Prisma.PartnerUpdateInput {
  const data: Prisma.PartnerUpdateInput = {};
  if (fields.organizationName !== undefined)
    data.organizationName = fields.organizationName;
  if (fields.category !== undefined) data.category = fields.category;
  if (fields.contactName !== undefined) data.contactName = fields.contactName;
  if (fields.contactEmail !== undefined)
    data.contactEmail = fields.contactEmail;
  if (fields.contactPhone !== undefined)
    data.contactPhone = fields.contactPhone;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.proposedContribution !== undefined)
    data.proposedContribution = fields.proposedContribution;
  if (fields.notes !== undefined) data.notes = fields.notes;
  if (fields.followUpAt !== undefined) data.followUpAt = fields.followUpAt;
  for (const key of [
    "partnershipName",
    "partnershipType",
    "agreementDetails",
    "agreementStartOn",
    "agreementEndOn",
    "agreedValueAmount",
    "agreedValueCurrency",
  ] as const) {
    if (fields[key] !== undefined) {
      (data as Record<string, unknown>)[key] = fields[key];
    }
  }
  data.updatedBy = { connect: { id: fields.updatedById } };
  if (fields.campaignId !== undefined) {
    data.campaign = fields.campaignId
      ? { connect: { id: fields.campaignId } }
      : { disconnect: true };
  }
  if (fields.eventId !== undefined) {
    data.event = fields.eventId
      ? { connect: { id: fields.eventId } }
      : { disconnect: true };
  }
  if (fields.ownerId !== undefined) {
    data.owner = fields.ownerId
      ? { connect: { id: fields.ownerId } }
      : { disconnect: true };
  }
  return data;
}

@Injectable()
export class PartnersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }

  /** Active members of a department - the pool a partner's owner must come
   * from whenever the partner itself belongs to that department, mirroring
   * `TasksRepository.listEligibleAssignees`. */
  async listEligibleOwners(
    departmentId: string,
  ): Promise<PartnerPersonRecord[]> {
    if (!isUuid(departmentId)) return [];
    return this.db.user.findMany({
      where: { departmentId, status: UserAccountStatus.ACTIVE },
      select: PERSON_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  private async campaignExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (
      (await this.db.campaign.count({ where: { id, archivedAt: null } })) === 1
    );
  }

  private async eventExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (
      (await this.db.event.count({ where: { id, archivedAt: null } })) === 1
    );
  }

  async findById(id: string): Promise<PartnerRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.partner.findUnique({
      where: { id },
      select: PARTNER_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  /** Every partner of these campaigns that the caller can see (EVE-233). */
  async listForCampaigns(
    campaignIds: readonly string[],
    visibility: PartnerVisibility,
  ): Promise<PartnerRecord[]> {
    const ids = campaignIds.filter(isUuid);
    if (ids.length === 0) return [];
    const items = await this.db.partner.findMany({
      where: { AND: [{ campaignId: { in: ids } }, visibleWhere(visibility)] },
      select: PARTNER_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return items.map(toRecord);
  }

  /** EVE-234: partner counts by status for one department, within the
   * caller's visibility. */
  async statusCounts(
    visibility: PartnerVisibility,
    departmentId: string,
  ): Promise<{ status: PartnerStatus; count: number }[]> {
    if (!isUuid(departmentId)) return [];
    const rows = await this.db.partner.groupBy({
      by: ["status"],
      where: { AND: [{ departmentId }, visibleWhere(visibility)] },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  async list(
    input: ListPartnersInput,
  ): Promise<{ items: PartnerRecord[]; total: number }> {
    const where: Prisma.PartnerWhereInput = {
      AND: [visibleWhere(input.visibility)],
      ...(input.status ? { status: input.status } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.partnershipType
        ? { partnershipType: input.partnershipType }
        : {}),
      ...(input.search
        ? { organizationName: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.partner.findMany({
        where,
        select: PARTNER_SELECT,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.partner.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async create(
    input: CreatePartnerInput,
  ): Promise<PartnerRecord | "campaign_not_found" | "event_not_found"> {
    if (input.campaignId && !(await this.campaignExists(input.campaignId))) {
      return "campaign_not_found";
    }
    if (input.eventId && !(await this.eventExists(input.eventId))) {
      return "event_not_found";
    }
    const created = await this.db.partner.create({
      data: {
        organizationName: input.organizationName,
        category: input.category,
        createdById: input.createdById,
        ...(input.contactName !== undefined
          ? { contactName: input.contactName }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail }
          : {}),
        ...(input.contactPhone !== undefined
          ? { contactPhone: input.contactPhone }
          : {}),
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.proposedContribution !== undefined
          ? { proposedContribution: input.proposedContribution }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.followUpAt !== undefined
          ? { followUpAt: input.followUpAt }
          : {}),
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.partnershipName !== undefined
          ? { partnershipName: input.partnershipName }
          : {}),
        ...(input.partnershipType !== undefined
          ? { partnershipType: input.partnershipType }
          : {}),
        ...(input.agreementDetails !== undefined
          ? { agreementDetails: input.agreementDetails }
          : {}),
        ...(input.agreementStartOn !== undefined
          ? { agreementStartOn: input.agreementStartOn }
          : {}),
        ...(input.agreementEndOn !== undefined
          ? { agreementEndOn: input.agreementEndOn }
          : {}),
        ...(input.agreedValueAmount !== undefined
          ? { agreedValueAmount: input.agreedValueAmount }
          : {}),
        ...(input.agreedValueCurrency !== undefined
          ? { agreedValueCurrency: input.agreedValueCurrency }
          : {}),
        updatedById: input.createdById,
      },
      select: PARTNER_SELECT,
    });
    return toRecord(created);
  }

  async update(
    id: string,
    fields: UpdatePartnerFields,
  ): Promise<
    PartnerRecord | "not_found" | "campaign_not_found" | "event_not_found"
  > {
    if (!isUuid(id)) return "not_found";
    const current = await this.db.partner.findUnique({
      where: { id },
      select: { campaignId: true, eventId: true },
    });
    if (!current) return "not_found";
    // Only a link being added or moved is checked. An existing link to archived
    // work stays as it is, so editing the partner never silently breaks it.
    if (
      fields.campaignId !== undefined &&
      fields.campaignId !== null &&
      fields.campaignId !== current.campaignId &&
      !(await this.campaignExists(fields.campaignId))
    ) {
      return "campaign_not_found";
    }
    if (
      fields.eventId !== undefined &&
      fields.eventId !== null &&
      fields.eventId !== current.eventId &&
      !(await this.eventExists(fields.eventId))
    ) {
      return "event_not_found";
    }
    try {
      const updated = await this.db.partner.update({
        where: { id },
        data: updateData(fields),
        select: PARTNER_SELECT,
      });
      return toRecord(updated);
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /** Locks the partner row for an attachment finalization (EVE-233). */
  async lockForAttachment(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM partners WHERE id = ${id}::uuid FOR UPDATE`,
    );
    return rows.length === 1;
  }

  async createAttachment(
    tx: Prisma.TransactionClient,
    input: { partnerId: string; fileId: string; attachedById: string },
  ): Promise<void> {
    await tx.partnerAttachment.create({
      data: {
        partnerId: input.partnerId,
        managedFileId: input.fileId,
        attachedById: input.attachedById,
      },
    });
  }

  async listAttachmentFileIds(
    partnerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!isUuid(partnerId)) return { fileIds: [], total: 0 };
    const where = { partnerId };
    const [rows, total] = await Promise.all([
      this.db.partnerAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.partnerAttachment.count({ where }),
    ]);
    return { fileIds: rows.map((row) => row.managedFileId), total };
  }

  async hasAttachment(partnerId: string, fileId: string): Promise<boolean> {
    if (!isUuid(partnerId) || !isUuid(fileId)) return false;
    return (
      (await this.db.partnerAttachment.count({
        where: { partnerId, managedFileId: fileId },
      })) === 1
    );
  }

  async listActivities(
    partnerId: string,
    input: ListPartnerActivitiesInput,
  ): Promise<{ items: PartnerActivityRecord[]; total: number }> {
    if (!isUuid(partnerId)) return { items: [], total: 0 };
    const where: Prisma.PartnerActivityWhereInput = { partnerId };
    const [items, total] = await Promise.all([
      this.db.partnerActivity.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.partnerActivity.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, author: item.author ?? null })),
      total,
    };
  }

  async createActivity(
    partnerId: string,
    input: CreatePartnerActivityInput,
  ): Promise<PartnerActivityRecord | "partner_not_found"> {
    if (!isUuid(partnerId)) return "partner_not_found";
    try {
      const created = await this.db.partnerActivity.create({
        data: { partnerId, authorId: input.authorId, note: input.note },
        select: ACTIVITY_SELECT,
      });
      return { ...created, author: created.author ?? null };
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "partner_not_found";
      }
      throw error;
    }
  }
}
