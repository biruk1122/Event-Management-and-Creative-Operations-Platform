import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";
import {
  LeaveLedgerEntryKind,
  LeaveRequestStatus,
  OutboxActorKind,
  Prisma,
  type LeaveRequestStatus as LeaveRequestStatusType,
} from "../../generated/prisma/client.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";
import type {
  LeaveRequestDecidedEventPayload,
  LeaveRequestSubmittedEventPayload,
} from "../../outbox/outbox.types.js";
import { planConsumption, type GrantBalance } from "../leave-balance.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function personName(
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : person.email;
}

export interface LeaveTypeContext {
  id: string;
  name: string;
  isActive: boolean;
}

export interface GrantRecord {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  grantedDays: number;
  remaining: number;
  grantedAt: Date;
  expiresAt: Date;
  note: string | null;
  createdAt: Date;
}

export interface BalanceSummary {
  totalRemaining: number;
  grants: { grantId: string; remaining: number; expiresAt: Date }[];
}

export interface LeaveRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeDepartmentId: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  reason: string | null;
  status: LeaveRequestStatusType;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

const REQUEST_SELECT = {
  id: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  daysRequested: true,
  reason: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  employee: {
    select: {
      departmentId: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  leaveType: { select: { name: true } },
  reviewedBy: { select: { firstName: true, lastName: true, email: true } },
} as const;

type RawRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  reason: string | null;
  status: LeaveRequestStatusType;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  employee: {
    departmentId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  leaveType: { name: string };
  reviewedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

function toRequestRecord(raw: RawRequest): LeaveRequestRecord {
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    employeeName: personName(raw.employee),
    employeeDepartmentId: raw.employee.departmentId,
    leaveTypeId: raw.leaveTypeId,
    leaveTypeName: raw.leaveType.name,
    startDate: raw.startDate,
    endDate: raw.endDate,
    daysRequested: raw.daysRequested,
    reason: raw.reason,
    status: raw.status,
    reviewedByName: personName(raw.reviewedBy),
    reviewedAt: raw.reviewedAt,
    reviewNote: raw.reviewNote,
    createdAt: raw.createdAt,
  };
}

/** Requests whose status still blocks a new, overlapping request. */
const BLOCKING_STATUSES: LeaveRequestStatusType[] = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
];

@Injectable()
export class LeaveRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async isActiveEmployee(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const count = await this.db.employeeProfile.count({
      where: { userId, employmentStatus: "ACTIVE" },
    });
    return count === 1;
  }

  async findLeaveTypeContext(id: string): Promise<LeaveTypeContext | null> {
    if (!isUuid(id)) return null;
    return this.db.leaveType.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
  }

  // -------------------------------------------------------------------
  // Grants and the ledger
  // -------------------------------------------------------------------

  /** Every balance-affecting event is a ledger entry, including the
   * initial grant - the ledger alone is the source of truth for a grant's
   * remaining balance, never the immutable `grantedDays` column by itself. */
  async createGrant(input: {
    employeeId: string;
    leaveTypeId: string;
    grantedDays: number;
    grantedAt: Date;
    expiresAt: Date;
    note?: string;
    createdById: string;
  }): Promise<GrantRecord> {
    return this.db.$transaction(async (tx) => {
      const grant = await tx.leaveGrant.create({
        data: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          grantedDays: input.grantedDays,
          grantedAt: input.grantedAt,
          expiresAt: input.expiresAt,
          createdById: input.createdById,
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        select: {
          id: true,
          grantedDays: true,
          grantedAt: true,
          expiresAt: true,
          note: true,
          createdAt: true,
        },
      });
      await tx.leaveLedgerEntry.create({
        data: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          grantId: grant.id,
          kind: LeaveLedgerEntryKind.GRANT,
          amountDays: input.grantedDays,
          createdById: input.createdById,
        },
      });
      const leaveType = await tx.leaveType.findUniqueOrThrow({
        where: { id: input.leaveTypeId },
        select: { name: true },
      });
      return {
        id: grant.id,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        leaveTypeName: leaveType.name,
        grantedDays: grant.grantedDays,
        remaining: grant.grantedDays,
        grantedAt: grant.grantedAt,
        expiresAt: grant.expiresAt,
        note: grant.note,
        createdAt: grant.createdAt,
      };
    });
  }

  async listGrants(
    employeeId: string,
    leaveTypeId?: string,
  ): Promise<GrantRecord[]> {
    if (!isUuid(employeeId)) return [];
    const grants = await this.db.leaveGrant.findMany({
      where: { employeeId, ...(leaveTypeId ? { leaveTypeId } : {}) },
      select: {
        id: true,
        leaveTypeId: true,
        grantedDays: true,
        grantedAt: true,
        expiresAt: true,
        note: true,
        createdAt: true,
        leaveType: { select: { name: true } },
        ledger: { select: { amountDays: true } },
      },
      orderBy: { grantedAt: "desc" },
    });
    return grants.map((grant) => ({
      id: grant.id,
      employeeId,
      leaveTypeId: grant.leaveTypeId,
      leaveTypeName: grant.leaveType.name,
      grantedDays: grant.grantedDays,
      remaining: grant.ledger.reduce((sum, entry) => sum + entry.amountDays, 0),
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt,
      note: grant.note,
      createdAt: grant.createdAt,
    }));
  }

  /** Non-expired grants only, each with its ledger-derived remaining
   * balance - the true current entitlement regardless of whether the
   * expiry job has already caught up to a just-expired grant. */
  async computeBalance(
    employeeId: string,
    leaveTypeId: string,
    asOf: Date,
  ): Promise<BalanceSummary> {
    const grants = await this.db.leaveGrant.findMany({
      where: { employeeId, leaveTypeId, expiresAt: { gt: asOf } },
      select: {
        id: true,
        expiresAt: true,
        ledger: { select: { amountDays: true } },
      },
      orderBy: { grantedAt: "asc" },
    });
    const summaries = grants.map((grant) => ({
      grantId: grant.id,
      remaining: grant.ledger.reduce((sum, entry) => sum + entry.amountDays, 0),
      expiresAt: grant.expiresAt,
    }));
    return {
      totalRemaining: summaries.reduce(
        (sum, grant) => sum + Math.max(0, grant.remaining),
        0,
      ),
      grants: summaries,
    };
  }

  /**
   * Writes the FIFO consumption plan as append-only `CONSUMPTION` ledger
   * entries in one transaction - the grants and their remaining balances
   * are re-read inside the transaction so a concurrent consumption against
   * the same grants can never double-spend them.
   */
  async consumeForRequest(input: {
    employeeId: string;
    leaveTypeId: string;
    daysToConsume: number;
    leaveRequestId: string;
    createdById: string;
    asOf: Date;
  }): Promise<"consumed" | "insufficient_balance"> {
    return this.db.$transaction(async (tx) => {
      const grants = await tx.leaveGrant.findMany({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          expiresAt: { gt: input.asOf },
        },
        select: { id: true, ledger: { select: { amountDays: true } } },
        orderBy: { grantedAt: "asc" },
      });
      const balances: GrantBalance[] = grants.map((grant) => ({
        grantId: grant.id,
        remaining: grant.ledger.reduce(
          (sum, entry) => sum + entry.amountDays,
          0,
        ),
      }));
      const plan = planConsumption(balances, input.daysToConsume);
      if (plan === "insufficient_balance") return "insufficient_balance";

      await tx.leaveLedgerEntry.createMany({
        data: plan.map((instruction) => ({
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          grantId: instruction.grantId,
          kind: LeaveLedgerEntryKind.CONSUMPTION,
          amountDays: instruction.amountDays,
          leaveRequestId: input.leaveRequestId,
          createdById: input.createdById,
        })),
      });
      return "consumed";
    });
  }

  // -------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------

  async hasOverlappingRequest(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    const count = await this.db.leaveRequest.count({
      where: {
        employeeId,
        status: { in: BLOCKING_STATUSES },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    return count > 0;
  }

  /** Whether the employee has an already-APPROVED leave request covering
   * any part of this date range - the integration point attendance calls
   * before letting a shift assignment or check-in proceed. Only APPROVED
   * counts; a merely PENDING request has not actually excused anything
   * yet. */
  async hasApprovedLeaveOverlap(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    if (!isUuid(employeeId)) return false;
    const count = await this.db.leaveRequest.count({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    return count > 0;
  }

  async createRequest(input: {
    employeeId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    daysRequested: number;
    reason?: string;
  }): Promise<LeaveRequestRecord> {
    const raw = await this.db.leaveRequest.create({
      data: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        daysRequested: input.daysRequested,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
      select: REQUEST_SELECT,
    });
    const record = toRequestRecord(raw);
    await this.outbox.record({
      name: "leave.request.submitted",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: input.employeeId,
      resourceType: "leave_request",
      resourceId: record.id,
      payload: {
        employeeId: input.employeeId,
      } satisfies LeaveRequestSubmittedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
    return record;
  }

  async findRequestById(id: string): Promise<LeaveRequestRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.leaveRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    return raw ? toRequestRecord(raw) : null;
  }

  async listRequests(input: {
    employeeId?: string;
    departmentId?: string;
    status?: LeaveRequestStatusType;
  }): Promise<LeaveRequestRecord[]> {
    const rows = await this.db.leaveRequest.findMany({
      where: {
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        ...(input.departmentId
          ? { employee: { departmentId: input.departmentId } }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      select: REQUEST_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRequestRecord);
  }

  async decideRequest(
    id: string,
    input: {
      status: LeaveRequestStatusType;
      reviewedById: string;
      reviewNote?: string;
    },
  ): Promise<LeaveRequestRecord> {
    const raw = await this.db.leaveRequest.update({
      where: { id },
      data: {
        status: input.status,
        reviewedAt: new Date(),
        reviewedById: input.reviewedById,
        reviewNote: input.reviewNote ?? null,
      },
      select: REQUEST_SELECT,
    });
    const record = toRequestRecord(raw);
    await this.outbox.record({
      name: "leave.request.decided",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: input.reviewedById,
      resourceType: "leave_request",
      resourceId: id,
      payload: {
        employeeId: record.employeeId,
      } satisfies LeaveRequestDecidedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
    return record;
  }

  async withdrawRequest(id: string): Promise<LeaveRequestRecord> {
    const raw = await this.db.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.WITHDRAWN },
      select: REQUEST_SELECT,
    });
    return toRequestRecord(raw);
  }

  async listApprovedInRange(input: {
    startDate: Date;
    endDate: Date;
    departmentId?: string;
    employeeId?: string;
  }): Promise<LeaveRequestRecord[]> {
    const rows = await this.db.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
        ...(input.departmentId
          ? { employee: { departmentId: input.departmentId } }
          : {}),
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      },
      select: REQUEST_SELECT,
      orderBy: { startDate: "asc" },
    });
    return rows.map(toRequestRecord);
  }

  // -------------------------------------------------------------------
  // Daily expiry job support
  // -------------------------------------------------------------------

  /** Grants whose own `expiresAt` has passed, not yet expired in the
   * ledger, and still carrying an unconsumed remainder - the daily job's
   * only candidates. */
  async findExpiringGrants(
    asOf: Date,
  ): Promise<
    { id: string; employeeId: string; leaveTypeId: string; remaining: number }[]
  > {
    const grants = await this.db.leaveGrant.findMany({
      where: {
        expiresAt: { lte: asOf },
        ledger: { none: { kind: LeaveLedgerEntryKind.EXPIRY } },
      },
      select: {
        id: true,
        employeeId: true,
        leaveTypeId: true,
        ledger: { select: { amountDays: true } },
      },
    });
    return grants
      .map((grant) => ({
        id: grant.id,
        employeeId: grant.employeeId,
        leaveTypeId: grant.leaveTypeId,
        remaining: grant.ledger.reduce(
          (sum, entry) => sum + entry.amountDays,
          0,
        ),
      }))
      .filter((grant) => grant.remaining > 0);
  }

  /** Writes the one EXPIRY entry a grant will ever have - the partial
   * unique index on `(grant_id) WHERE kind = 'EXPIRY'` makes a retried
   * call for the same grant a safe no-op rather than a double expiry. */
  async expireGrant(input: {
    grantId: string;
    employeeId: string;
    leaveTypeId: string;
    amountDays: number;
  }): Promise<"expired" | "already_expired"> {
    try {
      await this.db.leaveLedgerEntry.create({
        data: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          grantId: input.grantId,
          kind: LeaveLedgerEntryKind.EXPIRY,
          amountDays: -input.amountDays,
        },
      });
      return "expired";
    } catch (error) {
      if (isUniqueViolation(error)) return "already_expired";
      throw error;
    }
  }
}
