import { Injectable } from "@nestjs/common";

import {
  attendanceEmployeeNotFound,
  attendanceSelfApprovalForbidden,
} from "../attendance/attendance.errors.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import {
  AuditActorKind,
  AuditOutcome,
  LeaveRequestStatus,
  type PermissionScope,
} from "../generated/prisma/client.js";
import type { CreateLeaveGrantDto } from "./dto/create-leave-grant.dto.js";
import type { CreateLeaveRequestDto } from "./dto/create-leave-request.dto.js";
import type { DecideLeaveRequestDto } from "./dto/decide-leave-request.dto.js";
import { inclusiveDaySpan, twoYearsLater } from "./leave-balance.js";
import {
  leaveInsufficientBalance,
  leaveInvalidDateRange,
  leaveOverlap,
  leaveRequestAlreadyDecided,
  leaveRequestNotFound,
  leaveRequestNotWithdrawable,
  leaveTypeInactive,
  leaveTypeNotFound,
} from "./leave.errors.js";
import {
  LeaveRepository,
  type GrantRecord,
  type LeaveRequestRecord,
} from "./infrastructure/leave.repository.js";
import {
  LeaveBalanceResponse,
  LeaveGrantResponse,
  LeaveRequestResponse,
} from "./leave.contracts.js";

const GRANT_PERMISSION = "leave.grant.manage";
const REVIEW_PERMISSION = "leave.review";

function toGrantResponse(record: GrantRecord): LeaveGrantResponse {
  return {
    id: record.id,
    employeeId: record.employeeId,
    leaveTypeId: record.leaveTypeId,
    leaveTypeName: record.leaveTypeName,
    grantedDays: record.grantedDays,
    remaining: record.remaining,
    grantedAt: record.grantedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}

function toRequestResponse(record: LeaveRequestRecord): LeaveRequestResponse {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    leaveTypeId: record.leaveTypeId,
    leaveTypeName: record.leaveTypeName,
    startDate: record.startDate.toISOString().slice(0, 10),
    endDate: record.endDate.toISOString().slice(0, 10),
    daysRequested: record.daysRequested,
    reason: record.reason,
    status: record.status,
    reviewedByName: record.reviewedByName,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewNote: record.reviewNote,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Leave balances (HR-granted, FIFO-consumed, two-year-per-grant expiry) and
 * leave requests (full-day only, overlap- and balance-checked, approved
 * through the same DEPARTMENT/ORGANIZATION pattern as attendance review).
 * Self-approval is refused unconditionally - the same rule, and the same
 * shared error, as overtime and exception review.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly repository: LeaveRepository,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditWriterService,
  ) {}

  private hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  private async requireDepartmentBound(
    actingUserId: string,
    permissionKey: string,
    employeeDepartmentId: string | null,
  ): Promise<void> {
    if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION"))
      return;
    if (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT")) {
      const departmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === employeeDepartmentId) return;
    }
    throw permissionDenied();
  }

  private async requireActiveLeaveType(leaveTypeId: string): Promise<void> {
    const leaveType = await this.repository.findLeaveTypeContext(leaveTypeId);
    if (!leaveType) throw leaveTypeNotFound();
    if (!leaveType.isActive) throw leaveTypeInactive();
  }

  /** Viewing someone else's grants/balance is allowed to whichever of the
   * two leave management roles covers this employee - the HR bookkeeper
   * who grants balance, or the manager who reviews their requests. */
  private async requireEmployeeVisibility(
    actingUserId: string,
    employeeDepartmentId: string | null,
  ): Promise<void> {
    try {
      await this.requireDepartmentBound(
        actingUserId,
        GRANT_PERMISSION,
        employeeDepartmentId,
      );
      return;
    } catch {
      await this.requireDepartmentBound(
        actingUserId,
        REVIEW_PERMISSION,
        employeeDepartmentId,
      );
    }
  }

  // -------------------------------------------------------------------
  // Grants (HR bookkeeping)
  // -------------------------------------------------------------------

  async grant(
    actingUserId: string,
    dto: CreateLeaveGrantDto,
    requestId: string,
  ): Promise<LeaveGrantResponse> {
    if (!(await this.repository.isActiveEmployee(dto.employeeId))) {
      throw attendanceEmployeeNotFound();
    }
    const employeeDepartmentId = await this.repository.findUserDepartmentId(
      dto.employeeId,
    );
    await this.requireDepartmentBound(
      actingUserId,
      GRANT_PERMISSION,
      employeeDepartmentId,
    );
    await this.requireActiveLeaveType(dto.leaveTypeId);

    const grantedAt = new Date();
    const record = await this.repository.createGrant({
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      grantedDays: dto.grantedDays,
      grantedAt,
      expiresAt: twoYearsLater(grantedAt),
      createdById: actingUserId,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
    await this.audit.record({
      action: "leave.grant.created",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_grant",
      resourceId: record.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId: dto.employeeId, grantedDays: dto.grantedDays },
    });
    return toGrantResponse(record);
  }

  async listGrants(
    actingUserId: string,
    employeeId: string,
    leaveTypeId?: string,
  ): Promise<LeaveGrantResponse[]> {
    const viewingOwn = actingUserId === employeeId;
    if (!viewingOwn) {
      const employeeDepartmentId =
        await this.repository.findUserDepartmentId(employeeId);
      await this.requireEmployeeVisibility(actingUserId, employeeDepartmentId);
    }
    const records = await this.repository.listGrants(employeeId, leaveTypeId);
    return records.map(toGrantResponse);
  }

  async balance(
    actingUserId: string,
    employeeId: string,
    leaveTypeId: string,
  ): Promise<LeaveBalanceResponse> {
    const viewingOwn = actingUserId === employeeId;
    if (!viewingOwn) {
      const employeeDepartmentId =
        await this.repository.findUserDepartmentId(employeeId);
      await this.requireEmployeeVisibility(actingUserId, employeeDepartmentId);
    }
    await this.requireActiveLeaveType(leaveTypeId);
    const summary = await this.repository.computeBalance(
      employeeId,
      leaveTypeId,
      new Date(),
    );
    const grants = await this.repository.listGrants(employeeId, leaveTypeId);
    return {
      leaveTypeId,
      totalRemaining: summary.totalRemaining,
      grants: grants
        .filter((grant) =>
          summary.grants.some((entry) => entry.grantId === grant.id),
        )
        .map(toGrantResponse),
    };
  }

  // -------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------

  async createRequest(
    actingUserId: string,
    dto: CreateLeaveRequestDto,
    requestId: string,
  ): Promise<LeaveRequestResponse> {
    await this.requireActiveLeaveType(dto.leaveTypeId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) throw leaveInvalidDateRange();
    const daysRequested = inclusiveDaySpan(startDate, endDate);

    if (
      await this.repository.hasOverlappingRequest(
        actingUserId,
        startDate,
        endDate,
      )
    ) {
      throw leaveOverlap();
    }

    const balance = await this.repository.computeBalance(
      actingUserId,
      dto.leaveTypeId,
      new Date(),
    );
    if (balance.totalRemaining < daysRequested)
      throw leaveInsufficientBalance();

    const record = await this.repository.createRequest({
      employeeId: actingUserId,
      leaveTypeId: dto.leaveTypeId,
      startDate,
      endDate,
      daysRequested,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    });
    await this.audit.record({
      action: "leave.request.submitted",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_request",
      resourceId: record.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { leaveTypeId: dto.leaveTypeId, daysRequested },
    });
    return toRequestResponse(record);
  }

  async withdrawRequest(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<LeaveRequestResponse> {
    const request = await this.repository.findRequestById(id);
    if (!request) throw leaveRequestNotFound();
    if (request.employeeId !== actingUserId) throw permissionDenied();
    if (request.status !== LeaveRequestStatus.PENDING)
      throw leaveRequestNotWithdrawable();
    const record = await this.repository.withdrawRequest(id);
    await this.audit.record({
      action: "leave.request.withdrawn",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_request",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
    });
    return toRequestResponse(record);
  }

  /** `leave.read` (SELF, baseline) always lets an employee see their own
   * requests; `leave.review` additionally widens visibility to a
   * department or the whole organization - never narrows it below self. */
  async listRequests(
    actingUserId: string,
    input: { status?: LeaveRequestStatus; employeeId?: string },
  ): Promise<LeaveRequestResponse[]> {
    const org = await this.hasGrant(
      actingUserId,
      REVIEW_PERMISSION,
      "ORGANIZATION",
    );
    const dept =
      !org &&
      (await this.hasGrant(actingUserId, REVIEW_PERMISSION, "DEPARTMENT"));
    const departmentId = dept
      ? await this.repository.findUserDepartmentId(actingUserId)
      : null;
    const hasReviewVisibility = org || departmentId !== null;

    const records = await this.repository.listRequests({
      ...(hasReviewVisibility
        ? {
            ...(!org && departmentId ? { departmentId } : {}),
            ...(input.employeeId ? { employeeId: input.employeeId } : {}),
          }
        : { employeeId: actingUserId }),
      ...(input.status ? { status: input.status } : {}),
    });
    return records.map(toRequestResponse);
  }

  async decideRequest(
    actingUserId: string,
    id: string,
    dto: DecideLeaveRequestDto,
    requestId: string,
  ): Promise<LeaveRequestResponse> {
    const request = await this.repository.findRequestById(id);
    if (!request) throw leaveRequestNotFound();
    if (request.employeeId === actingUserId)
      throw attendanceSelfApprovalForbidden();
    await this.requireDepartmentBound(
      actingUserId,
      REVIEW_PERMISSION,
      request.employeeDepartmentId,
    );
    if (request.status !== LeaveRequestStatus.PENDING)
      throw leaveRequestAlreadyDecided();

    if (dto.decision === "APPROVED") {
      const result = await this.repository.consumeForRequest({
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        daysToConsume: request.daysRequested,
        leaveRequestId: request.id,
        createdById: actingUserId,
        asOf: new Date(),
      });
      if (result === "insufficient_balance") throw leaveInsufficientBalance();
    }

    const status =
      dto.decision === "APPROVED"
        ? LeaveRequestStatus.APPROVED
        : dto.decision === "REJECTED"
          ? LeaveRequestStatus.REJECTED
          : LeaveRequestStatus.RETURNED_FOR_CHANGES;

    const record = await this.repository.decideRequest(id, {
      status,
      reviewedById: actingUserId,
      ...(dto.reviewNote !== undefined ? { reviewNote: dto.reviewNote } : {}),
    });
    await this.audit.record({
      action:
        dto.decision === "APPROVED"
          ? "leave.request.approved"
          : dto.decision === "REJECTED"
            ? "leave.request.rejected"
            : "leave.request.returned_for_changes",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "leave_request",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId: request.employeeId },
    });
    return toRequestResponse(record);
  }

  async calendar(
    actingUserId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<LeaveRequestResponse[]> {
    const org = await this.hasGrant(
      actingUserId,
      REVIEW_PERMISSION,
      "ORGANIZATION",
    );
    const dept =
      !org &&
      (await this.hasGrant(actingUserId, REVIEW_PERMISSION, "DEPARTMENT"));
    const departmentId = dept
      ? await this.repository.findUserDepartmentId(actingUserId)
      : undefined;

    const records = await this.repository.listApprovedInRange({
      startDate,
      endDate,
      ...(org
        ? {}
        : departmentId
          ? { departmentId }
          : { employeeId: actingUserId }),
    });
    return records.map(toRequestResponse);
  }
}
