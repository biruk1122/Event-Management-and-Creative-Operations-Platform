import { ForbiddenException, Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { CreatePartnerActivityDto } from "./dto/create-partner-activity.dto.js";
import type { CreatePartnerDto } from "./dto/create-partner.dto.js";
import type { ListPartnerActivitiesQueryDto } from "./dto/list-partner-activities-query.dto.js";
import type { ListPartnersQueryDto } from "./dto/list-partners-query.dto.js";
import type { UpdatePartnerDto } from "./dto/update-partner.dto.js";
import type {
  PaginatedPartnerActivitiesResponse,
  PaginatedPartnersResponse,
  PartnerActivityResponse,
  PartnerResponse,
} from "./partners.contracts.js";
import {
  partnerAgreedValueIncomplete,
  partnerAgreementDatesInvalid,
  partnerCampaignNotFound,
  partnerDepartmentNotFound,
  partnerNotFound,
  partnerOwnerOutsideDepartment,
  partnerRelatedEventNotFound,
} from "./partners.errors.js";
import {
  PartnersRepository,
  type PartnerActivityRecord,
  type PartnerRecord,
  type PartnerVisibility,
} from "./infrastructure/partners.repository.js";

/**
 * Application service for the Marketing Department Workspace's partner
 * (sponsor/media/strategic-partner) directory: the precise authorization
 * boundary and the mapping from persistence records to public response
 * shapes. Follows the same `visibilityFor`/`isAuthorizedFor`/`authorize`
 * idiom as `TasksService`/`CampaignsService`, extended with the SELF scope
 * a Team Member holds over the relationships they own - so a team member may
 * view and contribute to a partnership they are the assigned owner of, but
 * never browse the department's full commercial/sponsor directory.
 */
@Injectable()
export class PartnersService {
  constructor(
    private readonly repository: PartnersRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async visibilityFor(
    actingUserId: string,
    permissionKey: string,
  ): Promise<PartnerVisibility> {
    const [organization, department, self] = await Promise.all([
      this.permissions.hasGrant(actingUserId, permissionKey, "ORGANIZATION"),
      this.permissions.hasGrant(actingUserId, permissionKey, "DEPARTMENT"),
      this.permissions.hasGrant(actingUserId, permissionKey, "SELF"),
    ]);
    if (!organization && !department && !self) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(actingUserId)
      : null;
    // Read-only oversight (EVE-229): `partner.read` only.
    const overseenDepartmentIds = organization
      ? []
      : await this.permissions.overseenDepartmentIdsFor(
          actingUserId,
          permissionKey,
        );
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(overseenDepartmentIds.length > 0 ? { overseenDepartmentIds } : {}),
      ...(self ? { selfUserId: actingUserId } : {}),
    };
  }

  private async isAuthorizedFor(
    actingUserId: string,
    permissionKey: string,
    partner: PartnerRecord,
  ): Promise<boolean> {
    if (
      await this.permissions.hasGrant(
        actingUserId,
        permissionKey,
        "ORGANIZATION",
      )
    )
      return true;
    if (
      await this.permissions.hasGrant(actingUserId, permissionKey, "DEPARTMENT")
    ) {
      const departmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === partner.departmentId) return true;
    }
    if (
      partner.departmentId &&
      (
        await this.permissions.overseenDepartmentIdsFor(
          actingUserId,
          permissionKey,
        )
      ).includes(partner.departmentId)
    )
      return true;
    if (await this.permissions.hasGrant(actingUserId, permissionKey, "SELF")) {
      if (partner.owner?.id === actingUserId) return true;
    }
    return false;
  }

  /** Loads a partner and enforces `permissionKey` against it in one call -
   * never reveals existence to a caller outside its scope. */
  private async authorize(
    actingUserId: string,
    id: string,
    permissionKey: string,
  ): Promise<PartnerRecord> {
    const partner = await this.repository.findById(id);
    if (!partner) {
      if (
        await this.permissions.hasGrant(
          actingUserId,
          permissionKey,
          "ORGANIZATION",
        )
      ) {
        throw partnerNotFound();
      }
      throw permissionDenied();
    }
    if (!(await this.isAuthorizedFor(actingUserId, permissionKey, partner))) {
      throw permissionDenied();
    }
    return partner;
  }

  async list(
    actingUserId: string,
    query: ListPartnersQueryDto,
  ): Promise<PaginatedPartnersResponse> {
    const visibility = await this.visibilityFor(actingUserId, "partner.read");

    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.partnershipType
        ? { partnershipType: query.partnershipType }
        : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toPartnerResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<PartnerResponse> {
    const partner = await this.authorize(actingUserId, id, "partner.read");
    return toPartnerResponse(partner);
  }

  /** Validates that `ownerId` is an active member of `departmentId` -
   * mirrors `TasksService.create`'s assignee check. Skipped when the
   * partner has no department (an organization-wide relationship), matching
   * that same precedent. */
  private async assertOwnerEligible(
    departmentId: string | undefined,
    ownerId: string | undefined,
  ): Promise<void> {
    if (!ownerId || !departmentId) return;
    const eligible = await this.repository.listEligibleOwners(departmentId);
    if (!eligible.some((user) => user.id === ownerId)) {
      throw partnerOwnerOutsideDepartment();
    }
  }

  async create(
    actingUserId: string,
    dto: CreatePartnerDto,
  ): Promise<PartnerResponse> {
    const organization = await this.permissions.hasGrant(
      actingUserId,
      "partner.create",
      "ORGANIZATION",
    );
    let departmentId = dto.departmentId;
    if (!organization) {
      if (
        !(await this.permissions.hasGrant(
          actingUserId,
          "partner.create",
          "DEPARTMENT",
        ))
      ) {
        throw permissionDenied();
      }
      // A department-scoped caller's own department is always used - never
      // trust the client's own `departmentId`.
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (!ownDepartmentId) throw permissionDenied();
      departmentId = ownDepartmentId;
    }
    if (departmentId && !(await this.repository.departmentExists(departmentId)))
      throw partnerDepartmentNotFound();

    await this.assertOwnerEligible(departmentId, dto.ownerId);
    assertAgreement({
      startOn: dto.agreementStartOn ?? null,
      endOn: dto.agreementEndOn ?? null,
      amount: dto.agreedValueAmount ?? null,
      currency: dto.agreedValueCurrency ?? null,
    });

    const followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : undefined;

    const result = await this.repository.create({
      organizationName: dto.organizationName.trim(),
      category: dto.category.trim(),
      createdById: actingUserId,
      ...(departmentId ? { departmentId } : {}),
      ...(dto.contactName !== undefined
        ? { contactName: dto.contactName.trim() }
        : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: dto.contactEmail.trim() }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone.trim() }
        : {}),
      ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
      ...(dto.eventId ? { eventId: dto.eventId } : {}),
      ...(dto.proposedContribution !== undefined
        ? { proposedContribution: dto.proposedContribution.trim() }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
      ...(followUpAt ? { followUpAt } : {}),
      ...(dto.ownerId ? { ownerId: dto.ownerId } : {}),
      ...(dto.partnershipName !== undefined
        ? { partnershipName: dto.partnershipName.trim() }
        : {}),
      ...(dto.partnershipType !== undefined
        ? { partnershipType: dto.partnershipType }
        : {}),
      ...(dto.agreementDetails !== undefined
        ? { agreementDetails: dto.agreementDetails.trim() }
        : {}),
      ...(dto.agreementStartOn !== undefined
        ? { agreementStartOn: new Date(dto.agreementStartOn) }
        : {}),
      ...(dto.agreementEndOn !== undefined
        ? { agreementEndOn: new Date(dto.agreementEndOn) }
        : {}),
      ...(dto.agreedValueAmount !== undefined
        ? { agreedValueAmount: dto.agreedValueAmount.toFixed(2) }
        : {}),
      ...(dto.agreedValueCurrency !== undefined
        ? { agreedValueCurrency: dto.agreedValueCurrency }
        : {}),
    });

    if (result === "campaign_not_found") throw partnerCampaignNotFound();
    if (result === "event_not_found") throw partnerRelatedEventNotFound();
    return toPartnerResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdatePartnerDto,
  ): Promise<PartnerResponse> {
    const partner = await this.authorize(actingUserId, id, "partner.update");

    if (dto.ownerId !== undefined && dto.ownerId !== null) {
      await this.assertOwnerEligible(
        partner.departmentId ?? undefined,
        dto.ownerId,
      );
    }
    // The agreement as it will be after this edit.
    assertAgreement({
      startOn:
        dto.agreementStartOn !== undefined
          ? dto.agreementStartOn
          : isoDate(partner.agreementStartOn),
      endOn:
        dto.agreementEndOn !== undefined
          ? dto.agreementEndOn
          : isoDate(partner.agreementEndOn),
      amount:
        dto.agreedValueAmount !== undefined
          ? dto.agreedValueAmount
          : partner.agreedValueAmount === null
            ? null
            : Number(partner.agreedValueAmount),
      currency:
        dto.agreedValueCurrency !== undefined
          ? dto.agreedValueCurrency
          : partner.agreedValueCurrency,
    });

    const result = await this.repository.update(id, {
      updatedById: actingUserId,
      ...(dto.partnershipName !== undefined
        ? {
            partnershipName:
              dto.partnershipName === null ? null : dto.partnershipName.trim(),
          }
        : {}),
      ...(dto.partnershipType !== undefined
        ? { partnershipType: dto.partnershipType }
        : {}),
      ...(dto.agreementDetails !== undefined
        ? {
            agreementDetails:
              dto.agreementDetails === null
                ? null
                : dto.agreementDetails.trim(),
          }
        : {}),
      ...(dto.agreementStartOn !== undefined
        ? {
            agreementStartOn:
              dto.agreementStartOn === null
                ? null
                : new Date(dto.agreementStartOn),
          }
        : {}),
      ...(dto.agreementEndOn !== undefined
        ? {
            agreementEndOn:
              dto.agreementEndOn === null ? null : new Date(dto.agreementEndOn),
          }
        : {}),
      ...(dto.agreedValueAmount !== undefined
        ? {
            agreedValueAmount:
              dto.agreedValueAmount === null
                ? null
                : dto.agreedValueAmount.toFixed(2),
          }
        : {}),
      ...(dto.agreedValueCurrency !== undefined
        ? { agreedValueCurrency: dto.agreedValueCurrency }
        : {}),
      ...(dto.organizationName !== undefined
        ? { organizationName: dto.organizationName.trim() }
        : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.contactName !== undefined
        ? {
            contactName:
              dto.contactName === null ? null : dto.contactName.trim(),
          }
        : {}),
      ...(dto.contactEmail !== undefined
        ? {
            contactEmail:
              dto.contactEmail === null ? null : dto.contactEmail.trim(),
          }
        : {}),
      ...(dto.contactPhone !== undefined
        ? {
            contactPhone:
              dto.contactPhone === null ? null : dto.contactPhone.trim(),
          }
        : {}),
      ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
      ...(dto.eventId !== undefined ? { eventId: dto.eventId } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.proposedContribution !== undefined
        ? {
            proposedContribution:
              dto.proposedContribution === null
                ? null
                : dto.proposedContribution.trim(),
          }
        : {}),
      ...(dto.notes !== undefined
        ? { notes: dto.notes === null ? null : dto.notes.trim() }
        : {}),
      ...(dto.followUpAt !== undefined
        ? {
            followUpAt:
              dto.followUpAt === null ? null : new Date(dto.followUpAt),
          }
        : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
    });

    if (result === "not_found") throw partnerNotFound();
    if (result === "campaign_not_found") throw partnerCampaignNotFound();
    if (result === "event_not_found") throw partnerRelatedEventNotFound();
    return toPartnerResponse(result);
  }

  // File pipeline hooks (EVE-233), mirroring ReportsService's attachment methods.

  /** Checks the caller may attach a document to this partner. */
  async authorizeAttachment(actingUserId: string, id: string): Promise<void> {
    await this.authorize(actingUserId, id, "partner.attachment.create");
  }

  /** Rechecks scope with the partner row locked, inside the file transaction. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; partnerId: string },
  ): Promise<void> {
    await this.authorize(
      input.actingUserId,
      input.partnerId,
      "partner.attachment.create",
    );
    if (!(await this.repository.lockForAttachment(tx, input.partnerId)))
      throw partnerNotFound();
  }

  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; partnerId: string; fileId: string },
  ): Promise<void> {
    await this.repository.createAttachment(tx, {
      partnerId: input.partnerId,
      fileId: input.fileId,
      attachedById: input.actingUserId,
    });
  }

  async listAttachmentFileIds(
    actingUserId: string,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorize(actingUserId, id, "partner.read");
    return this.repository.listAttachmentFileIds(id, page, pageSize);
  }

  async readAttachmentContext(
    actingUserId: string,
    id: string,
    fileId: string,
  ): Promise<Record<string, never> | null> {
    await this.authorize(actingUserId, id, "partner.read");
    return (await this.repository.hasAttachment(id, fileId)) ? {} : null;
  }

  /**
   * The partners of some campaigns, grouped by campaign, as far as the caller
   * may read partners (EVE-233 budget summary). A caller without
   * `partner.read` gets an empty map; any other failure is raised.
   */
  async listForCampaigns(
    actingUserId: string,
    campaignIds: readonly string[],
  ): Promise<Map<string, PartnerResponse[]>> {
    const result = new Map<string, PartnerResponse[]>();
    if (campaignIds.length === 0) return result;
    let visibility: PartnerVisibility;
    try {
      visibility = await this.visibilityFor(actingUserId, "partner.read");
    } catch (error) {
      if (error instanceof ForbiddenException) return result;
      throw error;
    }
    for (const record of await this.repository.listForCampaigns(
      campaignIds,
      visibility,
    )) {
      if (!record.campaignId) continue;
      const list = result.get(record.campaignId) ?? [];
      list.push(toPartnerResponse(record));
      result.set(record.campaignId, list);
    }
    return result;
  }

  async listActivities(
    actingUserId: string,
    id: string,
    query: ListPartnerActivitiesQueryDto,
  ): Promise<PaginatedPartnerActivitiesResponse> {
    await this.authorize(actingUserId, id, "partner.read");

    const { items, total } = await this.repository.listActivities(id, {
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toActivityResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createActivity(
    actingUserId: string,
    id: string,
    dto: CreatePartnerActivityDto,
  ): Promise<PartnerActivityResponse> {
    await this.authorize(actingUserId, id, "partner.activity.create");

    const result = await this.repository.createActivity(id, {
      authorId: actingUserId,
      note: dto.note.trim(),
    });
    if (result === "partner_not_found") throw partnerNotFound();
    return toActivityResponse(result);
  }
}

function toPartnerResponse(record: PartnerRecord): PartnerResponse {
  return {
    id: record.id,
    organizationName: record.organizationName,
    category: record.category,
    contactName: record.contactName,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    departmentId: record.departmentId,
    campaignId: record.campaignId,
    eventId: record.eventId,
    status: record.status,
    proposedContribution: record.proposedContribution,
    notes: record.notes,
    followUpAt: record.followUpAt ? record.followUpAt.toISOString() : null,
    owner: record.owner,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    partnershipName: record.partnershipName,
    partnershipType: record.partnershipType,
    agreementDetails: record.agreementDetails,
    agreementStartOn: isoDate(record.agreementStartOn),
    agreementEndOn: isoDate(record.agreementEndOn),
    agreedValueAmount:
      record.agreedValueAmount === null
        ? null
        : record.agreedValueAmount.toFixed(2),
    agreedValueCurrency: record.agreedValueCurrency?.trim() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** EVE-233: an agreement ends on or after it starts, and an agreed value
 * always comes with its currency. */
function assertAgreement(input: {
  startOn: string | null;
  endOn: string | null;
  amount: number | null;
  currency: string | null;
}): void {
  if (input.startOn && input.endOn && input.endOn < input.startOn)
    throw partnerAgreementDatesInvalid();
  if ((input.amount === null) !== (input.currency === null))
    throw partnerAgreedValueIncomplete();
}

function toActivityResponse(
  record: PartnerActivityRecord,
): PartnerActivityResponse {
  return {
    id: record.id,
    partnerId: record.partnerId,
    author: record.author,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}
