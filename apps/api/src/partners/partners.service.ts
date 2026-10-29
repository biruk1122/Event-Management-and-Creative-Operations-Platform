import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
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
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
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

    const result = await this.repository.update(id, {
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
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
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
