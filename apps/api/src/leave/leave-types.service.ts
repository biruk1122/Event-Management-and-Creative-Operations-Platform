import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../audit/audit-writer.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { AuditActorKind, AuditOutcome } from "../generated/prisma/client.js";
import { leaveTypeNameTaken, leaveTypeNotFound } from "./leave.errors.js";
import type { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import type { UpdateLeaveTypeDto } from "./dto/update-leave-type.dto.js";
import { LeaveTypeResponse } from "./leave-types.contracts.js";
import {
  LeaveTypesRepository,
  type LeaveTypeRecord,
} from "./infrastructure/leave-types.repository.js";

function toResponse(record: LeaveTypeRecord): LeaveTypeResponse {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    isPaid: record.isPaid,
    requiresDocumentation: record.requiresDocumentation,
    requiresApproval: record.requiresApproval,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Leave type configuration - Super Admin only (`leave.type.manage` has no
 * DEPARTMENT-scope grant anywhere in the catalog). Policy, never hard-coded:
 * every entitlement/approval rule an administrator sets here is what the
 * rest of the leave feature reads back, not a literal in code.
 */
@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly repository: LeaveTypesRepository,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditWriterService,
  ) {}

  private async requireManage(actingUserId: string): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, "leave.type.manage", "ORGANIZATION"))
    ) {
      throw permissionDenied();
    }
  }

  async create(
    actingUserId: string,
    dto: CreateLeaveTypeDto,
    requestId: string,
  ): Promise<LeaveTypeResponse> {
    await this.requireManage(actingUserId);
    const result = await this.repository.create({
      name: dto.name,
      createdById: actingUserId,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
      ...(dto.requiresDocumentation !== undefined
        ? { requiresDocumentation: dto.requiresDocumentation }
        : {}),
      ...(dto.requiresApproval !== undefined ? { requiresApproval: dto.requiresApproval } : {}),
    });
    if (result === "name_taken") throw leaveTypeNameTaken();
    await this.audit.record({
      action: "leave.type.created",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_type",
      resourceId: result.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { name: dto.name },
    });
    return toResponse(result);
  }

  async list(actingUserId: string, includeInactive: boolean): Promise<LeaveTypeResponse[]> {
    if (includeInactive) await this.requireManage(actingUserId);
    const records = await this.repository.list(includeInactive);
    return records.map(toResponse);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateLeaveTypeDto,
    requestId: string,
  ): Promise<LeaveTypeResponse> {
    await this.requireManage(actingUserId);
    const existing = await this.repository.findById(id);
    if (!existing) throw leaveTypeNotFound();
    const record = await this.repository.update(id, {
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
      ...(dto.requiresDocumentation !== undefined
        ? { requiresDocumentation: dto.requiresDocumentation }
        : {}),
      ...(dto.requiresApproval !== undefined ? { requiresApproval: dto.requiresApproval } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    await this.audit.record({
      action: "leave.type.updated",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_type",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
    });
    return toResponse(record);
  }
}
